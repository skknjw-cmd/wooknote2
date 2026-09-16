import { NextRequest, NextResponse } from "next/server";
import { Client, isHTTPResponseError } from "@notionhq/client";
import {
  buildBlocks,
  chunkBlocks,
  filterProperties,
  type NotionPropertySchema,
} from "@/lib/notionBlocks";
import { resolveDataSource } from "@/lib/notionResolve";
import type { NotionMeetingPayload, NotionMappingConfig, NotionSaveResponse } from "@/types/meeting";

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
  };
  const payload = body.meeting;
  const mapping = body.mapping ?? null;
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
  let properties: Record<string, unknown>;
  let skippedProperties: string[];
  try {
    const schema: NotionPropertySchema =
      resolved.schema ??
      (await notion.dataSources.retrieve({ data_source_id: dataSourceId })).properties;
    const filtered = filterProperties(schema, payload, mappingUsable ? mapping.fields : null);
    properties = filtered.properties;
    skippedProperties = filtered.skipped;
  } catch (err) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: "schema", error: `속성 스키마를 읽지 못했습니다. (${errorMessage(err)})` },
      { status: httpStatus(err) },
    );
  }

  // 3. 블록 생성 후 첫 100개는 페이지 생성과 함께, 나머지는 append
  const blocks = buildBlocks(payload);
  const chunks = chunkBlocks(blocks);
  const totalBlocks = blocks.length;

  let pageId: string;
  try {
    const page = await notion.pages.create({
      parent: { data_source_id: dataSourceId },
      properties: properties as never,
      children: (chunks[0] ?? []) as never,
    });
    pageId = page.id;
  } catch (err) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: "create", error: `페이지를 만들지 못했습니다. (${errorMessage(err)})` },
      { status: httpStatus(err) },
    );
  }

  let savedBlocks = (chunks[0] ?? []).length;
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
  });
}
