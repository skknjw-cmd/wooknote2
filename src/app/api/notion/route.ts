import { NextRequest, NextResponse } from "next/server";
import { Client, APIResponseError } from "@notionhq/client";
import {
  buildBlocks,
  chunkBlocks,
  filterProperties,
  type NotionPropertySchema,
} from "@/lib/notionBlocks";
import type { NotionMeetingPayload, NotionSaveResponse } from "@/types/meeting";

export const maxDuration = 120;

/** 429/5xx는 1.5초 후 1회만 재시도한다. */
const RETRY_DELAY_MS = 1500;

function isRetryable(err: unknown): boolean {
  if (!(err instanceof APIResponseError)) return false;
  return err.status === 429 || err.status >= 500;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable(err)) throw err;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return fn();
  }
}

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
    const db = await withRetry(() => notion.databases.retrieve({ database_id: databaseId }));
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
    const status = err instanceof APIResponseError ? err.status : 500;
    const stage = status === 401 || status === 403 ? "auth" : "schema";
    const error =
      stage === "auth"
        ? "Notion 토큰이 유효하지 않거나 통합이 데이터베이스에 초대되지 않았습니다."
        : `데이터베이스 ID를 확인하세요. (${errorMessage(err)})`;
    return NextResponse.json<NotionSaveResponse>({ ok: false, stage, error }, { status });
  }

  // 2. 속성 스키마 조회 → 실재하는 속성만 채움
  let properties: Record<string, unknown>;
  let skippedProperties: string[];
  try {
    const ds = await withRetry(() => notion.dataSources.retrieve({ data_source_id: dataSourceId }));
    const schema: NotionPropertySchema = ds.properties;
    const filtered = filterProperties(schema, payload);
    properties = filtered.properties;
    skippedProperties = filtered.skipped;
  } catch (err) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: "schema", error: `속성 스키마를 읽지 못했습니다. (${errorMessage(err)})` },
      { status: err instanceof APIResponseError ? err.status : 500 },
    );
  }

  // 3. 블록 생성 후 첫 100개는 페이지 생성과 함께, 나머지는 append
  const blocks = buildBlocks(payload);
  const chunks = chunkBlocks(blocks);
  const totalBlocks = blocks.length;

  let pageId: string;
  try {
    const page = await withRetry(() =>
      notion.pages.create({
        parent: { data_source_id: dataSourceId },
        properties: properties as never,
        children: (chunks[0] ?? []) as never,
      }),
    );
    pageId = page.id;
  } catch (err) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: "create", error: `페이지를 만들지 못했습니다. (${errorMessage(err)})` },
      { status: err instanceof APIResponseError ? err.status : 500 },
    );
  }

  let savedBlocks = (chunks[0] ?? []).length;
  for (const chunk of chunks.slice(1)) {
    try {
      await withRetry(() =>
        notion.blocks.children.append({ block_id: pageId, children: chunk as never }),
      );
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
