import { NextRequest, NextResponse } from "next/server";
import { Client, isHTTPResponseError } from "@notionhq/client";
import {
  buildAppendBlocks,
  buildBlocks,
  chunkBlocks,
  filterProperties,
  type NotionPropertySchema,
} from "@/lib/notionBlocks";
import { resolveDataSource } from "@/lib/notionResolve";
import type {
  NotionMeetingPayload,
  NotionMappingConfig,
  NotionSaveResponse,
  NotionFieldKey,
  NotionUpdateKey,
} from "@/types/meeting";

export const maxDuration = 120;

// 재시도는 @notionhq/client가 내부적으로 처리한다(Client.js의 canRetry).
// SDK는 429는 항상 재시도하지만 5xx는 멱등 메서드(GET/DELETE)에만 재시도한다 —
// pages.create / blocks.children.append를 5xx에서 다시 보내면 같은 회의로 페이지가
// 둘 생기거나 트랜스크립트 블록 100개가 중복되기 때문이다.
// 여기서 별도 재시도 래퍼를 두면 그 보호가 무너지므로 SDK 기본값을 그대로 쓴다.

// SDK 기본값과 같은 값이지만 명시적으로 고정한다. 패키지를 올렸을 때 API 버전이
// 조용히 바뀌면 데이터 소스 구조(2025-09-03에서 도입)가 통째로 달라진다.
const NOTION_VERSION = "2025-09-03";

// Notion rate limit은 평균 초당 3요청이다. append를 연달아 보낼 때 간격을 둔다.
const APPEND_DELAY_MS = 350;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function httpStatus(err: unknown): number {
  return isHTTPResponseError(err) ? err.status : 500;
}

/**
 * 이어 붙이기에서 늘 갱신하는 속성. 회의일시·입력방식은 이어 녹음으로 바뀌지 않는다.
 * 제목은 앱에서 바뀌었을 때만 여기에 더한다(아래 appendUpdateFields 참고).
 */
const APPEND_UPDATE_FIELDS: NotionFieldKey[] = ["durationText", "status"];

/**
 * 이번 갱신에서 바꿀 속성을 정한다.
 *
 * 제목·회의일시·참석자는 앱의 값이 **마지막으로 보낸 값과 다를 때만** 넣는다.
 * 매번 덮어쓰면 Notion에서 손으로 고쳐 둔 값이 이어 녹음마다 되돌아가고, 아예 빼면
 * 1차 저장 뒤에 앱에서 고친 값이 영영 반영되지 않는다. 기록이 없는 노트(이 기능
 * 이전에 저장된 노트)는 마지막으로 보낸 값을 알 수 없으므로 한 번 맞춰준다.
 *
 * 소요시간과 상태는 늘 갱신한다 — 녹음 길이와 저장 상태는 앱만 아는 값이다.
 */
function appendUpdateFields(
  payload: NotionMeetingPayload,
  target: { syncedTitle?: string; syncedDate?: string; syncedAttendees?: string },
): NotionUpdateKey[] {
  const fields: NotionUpdateKey[] = [...APPEND_UPDATE_FIELDS];
  if (payload.title !== target.syncedTitle) fields.push("title");
  if (payload.meetingDate !== target.syncedDate) fields.push("meetingDate");
  if (attendeeKey(payload) !== target.syncedAttendees) fields.push("attendees");
  return fields;
}

/** 참석자는 배열이라 그대로 비교할 수 없다. 보낸 모양 그대로 한 줄로 만들어 비교한다. */
function attendeeKey(payload: NotionMeetingPayload): string {
  return payload.attendees.join(", ");
}

type CreateResult =
  | { ok: true; pageId: string }
  | { ok: false; response: ReturnType<typeof NextResponse.json<NotionSaveResponse>> };

async function createPage(
  notion: Client,
  dataSourceId: string,
  properties: Record<string, unknown>,
  firstChunk: unknown[],
): Promise<CreateResult> {
  try {
    const page = await notion.pages.create({
      parent: { data_source_id: dataSourceId },
      properties: properties as never,
      children: firstChunk as never,
    });
    return { ok: true, pageId: page.id };
  } catch (err) {
    return {
      ok: false,
      response: NextResponse.json<NotionSaveResponse>(
        { ok: false, stage: "create", error: `페이지를 만들지 못했습니다. (${errorMessage(err)})` },
        { status: httpStatus(err) },
      ),
    };
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-notion-token");
  const databaseId = req.headers.get("x-notion-db");

  if (!token || !databaseId) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: "auth", error: "Notion 토큰 또는 데이터베이스 ID가 없습니다." },
      { status: 400 },
    );
  }

  const body = (await req.json()) as {
    meeting: NotionMeetingPayload;
    mapping?: NotionMappingConfig | null;
    /** 있으면 새로 만들지 않고 이 페이지에 이어 붙인다. */
    target?: {
      pageId: string;
      fromTurn: number;
      syncedTitle?: string;
      syncedDate?: string;
      syncedAttendees?: string;
    } | null;
  };
  const payload = body.meeting;
  const mapping = body.mapping ?? null;
  const target = body.target ?? null;
  const notion = new Client({ auth: token, notionVersion: NOTION_VERSION });

  // 1. 입력값을 데이터 소스로 해석한다.
  //    2025-09-03 API에서 데이터베이스는 데이터 소스의 컨테이너이고, 속성 스키마는
  //    데이터베이스가 아니라 데이터 소스에 있다. 사용자가 둘 중 어느 ID를 붙여넣었는지
  //    구분할 방법이 없으므로 데이터베이스로 먼저 시도하고, 실패하면 데이터 소스로 본다.
  const resolved = await resolveDataSource(notion, databaseId);
  if (!resolved.ok) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: resolved.stage, error: resolved.error },
      { status: resolved.status },
    );
  }
  const { dataSourceId, dataSourceName } = resolved;

  // 매핑이 다른 data source의 것이면 쓰지 않는다. 속성 이름이 우연히 겹치면
  // 엉뚱한 곳에 값이 들어가고, 사용자는 왜 그런지 알 수 없다.
  const mappingUsable = !!mapping && mapping.dataSourceId === dataSourceId;
  const mappingIgnored = !!mapping && !mappingUsable;

  // 2. 속성 스키마 → 실재하는 속성만 채움
  let schema: NotionPropertySchema;
  try {
    schema =
      resolved.schema ??
      (await notion.dataSources.retrieve({ data_source_id: dataSourceId })).properties;
  } catch (err) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: "schema", error: `속성 스키마를 읽지 못했습니다. (${errorMessage(err)})` },
      { status: httpStatus(err) },
    );
  }
  const fields = mappingUsable ? mapping.fields : null;

  // 이어 붙이기는 일부 속성만 갱신한다. 무엇을 갱신할지는 appendUpdateFields가 정한다.
  const filtered = filterProperties(
    schema,
    payload,
    fields,
    target ? appendUpdateFields(payload, target) : undefined,
  );
  let properties = filtered.properties;
  let skippedProperties = filtered.skipped;

  // 3. 블록 생성 후 첫 100개는 페이지 생성과 함께, 나머지는 append
  //    이어 붙이기는 이미 보낸 발화를 빼고 새 발화만 만든다.
  let chunks = chunkBlocks(target ? buildAppendBlocks(payload, target.fromTurn) : buildBlocks(payload));
  let totalBlocks = chunks.reduce((n, c) => n + c.length, 0);

  let pageId: string;
  let appended = false;
  let pageRecreated = false;

  if (target) {
    // 기존 페이지에 이어 붙인다. 앞부분은 건드리지 않는다 — Claude가 그 페이지에
    // 써넣은 요약·결정사항이 사라지면 안 되기 때문이다.
    try {
      await notion.pages.update({ page_id: target.pageId, properties: properties as never });
      pageId = target.pageId;
      appended = true;
    } catch (err) {
      // 사용자가 Notion에서 페이지를 지웠을 수 있다. 여기서 실패로 끝내면 그 노트는
      // 영원히 저장되지 않으므로, 새 페이지를 만들고 클라이언트에 알린다.
      if (httpStatus(err) !== 404) {
        return NextResponse.json<NotionSaveResponse>(
          { ok: false, stage: "create", error: `기존 페이지를 갱신하지 못했습니다. (${errorMessage(err)})` },
          { status: httpStatus(err) },
        );
      }
      // 새로 만드는 페이지는 이어 붙일 앞부분이 없다. 회의 전체를 다시 만들고
      // 속성도 제한 없이 모두 채운다 — 그러지 않으면 제목 없는 반쪽 페이지가 남는다.
      const full = filterProperties(schema, payload, fields);
      properties = full.properties;
      skippedProperties = full.skipped;
      chunks = chunkBlocks(buildBlocks(payload));
      totalBlocks = chunks.reduce((n, c) => n + c.length, 0);

      const recreated = await createPage(notion, dataSourceId, properties, chunks[0] ?? []);
      if (!recreated.ok) return recreated.response;
      pageId = recreated.pageId;
      pageRecreated = true;
    }
  } else {
    const created = await createPage(notion, dataSourceId, properties, chunks[0] ?? []);
    if (!created.ok) return created.response;
    pageId = created.pageId;
  }

  // 이어 붙이기는 첫 덩어리도 append로 보낸다(페이지 생성에 실어 보낼 수 없으므로).
  // 페이지를 새로 만든 경우에는 첫 덩어리가 이미 children으로 들어갔다.
  let savedBlocks = appended ? 0 : (chunks[0] ?? []).length;
  if (appended && chunks[0]) {
    try {
      await notion.blocks.children.append({ block_id: pageId, children: chunks[0] as never });
      savedBlocks = chunks[0].length;
    } catch (err) {
      return NextResponse.json<NotionSaveResponse>({
        ok: false, stage: "append", pageId, savedBlocks, totalBlocks, error: errorMessage(err),
      });
    }
  }
  for (const chunk of chunks.slice(1)) {
    try {
      // 요청 사이에 간격을 둬 rate limit(평균 초당 3요청)에 걸리지 않게 한다.
      await sleep(APPEND_DELAY_MS);
      await notion.blocks.children.append({ block_id: pageId, children: chunk as never });
      savedBlocks += chunk.length;
    } catch (err) {
      // 페이지는 이미 존재하므로 부분 성공으로 200을 돌려준다.
      return NextResponse.json<NotionSaveResponse>({
        ok: false,
        stage: "append",
        pageId,
        savedBlocks,
        totalBlocks,
        error: errorMessage(err),
      });
    }
  }

  return NextResponse.json<NotionSaveResponse>({
    ok: true,
    pageId,
    totalBlocks,
    skippedProperties,
    dataSourceName,
    mappingIgnored,
    appended,
    pageRecreated,
    syncedTurns: payload.turns.length,
    syncedTitle: payload.title,
    syncedDate: payload.meetingDate,
    syncedAttendees: attendeeKey(payload),
  });
}
