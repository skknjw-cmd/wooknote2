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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  const notion = new Client({ auth: token });

  // 1. 데이터베이스 → 데이터 소스 ID 해석
  //    2025-09-03 API에서 속성 스키마는 데이터베이스가 아니라 데이터 소스에 있다.
  let dataSourceId: string;
  let dataSourceName: string;
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
  } catch (err) {
    const status = isHTTPResponseError(err) ? err.status : 500;
    const stage = status === 401 || status === 403 ? "auth" : "schema";
    const error =
      stage === "auth"
        ? "Notion 토큰이 유효하지 않거나 통합이 데이터베이스에 초대되지 않았습니다."
        : `데이터베이스를 찾을 수 없습니다. 데이터베이스 ID가 맞는지, 그리고 Notion에서 통합(Integration)을 이 데이터베이스에 초대했는지 확인하세요. (${errorMessage(err)})`;
    return NextResponse.json<NotionSaveResponse>({ ok: false, stage, error }, { status });
  }

  // 2. 속성 스키마 조회 → 실재하는 속성만 채움
  let properties: Record<string, unknown>;
  let skippedProperties: string[];
  try {
    const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
    const schema: NotionPropertySchema = ds.properties;
    const filtered = filterProperties(schema, payload);
    properties = filtered.properties;
    skippedProperties = filtered.skipped;
  } catch (err) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: "schema", error: `속성 스키마를 읽지 못했습니다. (${errorMessage(err)})` },
      { status: isHTTPResponseError(err) ? err.status : 500 },
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
      { status: isHTTPResponseError(err) ? err.status : 500 },
    );
  }

  let savedBlocks = (chunks[0] ?? []).length;
  for (const chunk of chunks.slice(1)) {
    try {
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
