import { NextRequest, NextResponse } from "next/server";
import { Client, isHTTPResponseError } from "@notionhq/client";
import {
  buildBlocks,
  chunkBlocks,
  filterProperties,
  type NotionPropertySchema,
} from "@/lib/notionBlocks";
import type { NotionMeetingPayload, NotionSaveResponse } from "@/types/meeting";

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

/** 상태 코드별 안내. 404는 통합 미초대가 가장 흔한 원인이라 그걸 앞세운다. */
function lookupErrorMessage(status: number, err: unknown): string {
  if (status === 401 || status === 403) {
    return `Notion 토큰이 유효하지 않습니다. 설정에서 Internal Integration Token을 다시 확인하세요. (${errorMessage(err)})`;
  }
  if (status === 400) {
    return `ID 형식이 올바르지 않거나 데이터 소스가 일치하지 않습니다. 32자 ID 또는 Notion URL을 그대로 붙여넣었는지 확인하세요. (${errorMessage(err)})`;
  }
  return `데이터베이스를 찾을 수 없습니다. ID가 맞는지, 그리고 Notion에서 해당 DB 우측 상단 ⋯ → 연결로 통합(Integration)을 초대했는지 확인하세요. (${errorMessage(err)})`;
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

  const payload = (await req.json()) as NotionMeetingPayload;
  const notion = new Client({ auth: token, notionVersion: NOTION_VERSION });

  // 1. 입력값을 데이터 소스로 해석한다.
  //    2025-09-03 API에서 데이터베이스는 데이터 소스의 컨테이너이고, 속성 스키마는
  //    데이터베이스가 아니라 데이터 소스에 있다. 사용자가 둘 중 어느 ID를 붙여넣었는지
  //    구분할 방법이 없으므로 데이터베이스로 먼저 시도하고, 실패하면 데이터 소스로 본다.
  let dataSourceId: string;
  let dataSourceName: string;
  //    폴백이 성공하면 스키마를 그 응답에서 바로 얻으므로 2차 조회를 건너뛴다.
  let schemaFromFallback: NotionPropertySchema | null = null;

  try {
    const db = await notion.databases.retrieve({ database_id: databaseId });
    const sources = "data_sources" in db ? db.data_sources : [];
    if (sources.length === 0) {
      return NextResponse.json<NotionSaveResponse>(
        { ok: false, stage: "schema", error: "이 데이터베이스에는 데이터 소스가 없습니다." },
        { status: 400 },
      );
    }
    dataSourceId = sources[0].id;
    dataSourceName = sources[0].name;
  } catch (dbErr) {
    const dbStatus = httpStatus(dbErr);

    // 토큰 자체가 잘못된 경우에는 폴백해도 같은 이유로 실패하므로 바로 알린다.
    if (dbStatus === 401 || dbStatus === 403) {
      return NextResponse.json<NotionSaveResponse>(
        { ok: false, stage: "auth", error: lookupErrorMessage(dbStatus, dbErr) },
        { status: dbStatus },
      );
    }

    try {
      const ds = await notion.dataSources.retrieve({ data_source_id: databaseId });
      dataSourceId = ds.id;
      dataSourceName = "title" in ds ? (ds.title[0]?.plain_text ?? "") : "";
      schemaFromFallback = ds.properties;
    } catch {
      // 둘 다 실패했으면 원래(데이터베이스) 오류가 사용자에게 더 유용하다.
      return NextResponse.json<NotionSaveResponse>(
        { ok: false, stage: "schema", error: lookupErrorMessage(dbStatus, dbErr) },
        { status: dbStatus },
      );
    }
  }

  // 2. 속성 스키마 → 실재하는 속성만 채움
  let properties: Record<string, unknown>;
  let skippedProperties: string[];
  try {
    const schema: NotionPropertySchema =
      schemaFromFallback ??
      (await notion.dataSources.retrieve({ data_source_id: dataSourceId })).properties;
    const filtered = filterProperties(schema, payload);
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
  });
}
