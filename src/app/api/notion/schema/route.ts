import { NextRequest, NextResponse } from "next/server";
import { Client, isHTTPResponseError } from "@notionhq/client";
import { listProperties, type NotionPropertySchema } from "@/lib/notionBlocks";
import { resolveDataSource } from "@/lib/notionResolve";
import type { NotionSchemaResponse } from "@/types/meeting";

export const maxDuration = 30;

// SDK 기본값과 같지만 명시적으로 고정한다. 패키지를 올렸을 때 API 버전이 조용히
// 바뀌면 데이터 소스 구조(2025-09-03에서 도입)가 통째로 달라진다.
const NOTION_VERSION = "2025-09-03";

/**
 * 연결 테스트. 저장하지 않고 DB를 확인해 제목과 속성 목록만 돌려준다.
 * 읽기 전용이지만 자격증명이 헤더에 실리므로 GET이 아니라 POST로 받는다.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-notion-token");
  const databaseId = req.headers.get("x-notion-db");

  if (!token || !databaseId) {
    return NextResponse.json<NotionSchemaResponse>(
      { ok: false, stage: "auth", error: "Notion 토큰 또는 데이터베이스 ID가 없습니다." },
      { status: 400 },
    );
  }

  const notion = new Client({ auth: token, notionVersion: NOTION_VERSION });

  const resolved = await resolveDataSource(notion, databaseId);
  if (!resolved.ok) {
    return NextResponse.json<NotionSchemaResponse>(
      { ok: false, stage: resolved.stage, error: resolved.error },
      { status: resolved.status },
    );
  }

  try {
    const schema: NotionPropertySchema =
      resolved.schema ??
      (await notion.dataSources.retrieve({ data_source_id: resolved.dataSourceId })).properties;

    return NextResponse.json<NotionSchemaResponse>({
      ok: true,
      dataSourceId: resolved.dataSourceId,
      dataSourceName: resolved.dataSourceName,
      properties: listProperties(schema),
    });
  } catch (err) {
    return NextResponse.json<NotionSchemaResponse>(
      {
        ok: false,
        stage: "schema",
        error: `속성 스키마를 읽지 못했습니다. (${err instanceof Error ? err.message : String(err)})`,
      },
      { status: isHTTPResponseError(err) ? err.status : 500 },
    );
  }
}
