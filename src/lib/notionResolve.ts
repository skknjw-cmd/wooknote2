import { Client, isHTTPResponseError } from "@notionhq/client";
import { lookupErrorMessage, stageForStatus } from "@/lib/notionErrors";
import type { NotionPropertySchema } from "@/lib/notionBlocks";

export type ResolveResult =
  | {
      ok: true;
      dataSourceId: string;
      dataSourceName: string;
      /** 폴백이 성공한 경우에만 채워진다. 그때는 2차 조회를 건너뛸 수 있다. */
      schema: NotionPropertySchema | null;
    }
  | { ok: false; status: number; stage: "auth" | "schema"; error: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function httpStatus(err: unknown): number {
  return isHTTPResponseError(err) ? err.status : 500;
}

/**
 * 입력값을 데이터 소스로 해석한다.
 *
 * 2025-09-03 API에서 데이터베이스는 데이터 소스의 컨테이너이고, 속성 스키마는
 * 데이터베이스가 아니라 데이터 소스에 있다. 사용자가 둘 중 어느 ID를 붙여넣었는지
 * 구분할 방법이 없으므로 데이터베이스로 먼저 시도하고, 실패하면 데이터 소스로 본다.
 */
export async function resolveDataSource(notion: Client, inputId: string): Promise<ResolveResult> {
  try {
    const db = await notion.databases.retrieve({ database_id: inputId });
    const sources = "data_sources" in db ? db.data_sources : [];
    if (sources.length === 0) {
      return {
        ok: false,
        status: 400,
        stage: "schema",
        error: "이 데이터베이스에는 데이터 소스가 없습니다.",
      };
    }
    return { ok: true, dataSourceId: sources[0].id, dataSourceName: sources[0].name, schema: null };
  } catch (dbErr) {
    const dbStatus = httpStatus(dbErr);

    // 토큰 자체가 잘못된 경우에는 폴백해도 같은 이유로 실패하므로 바로 알린다.
    // 폴백까지 돌리면 그 실패가 진짜 원인을 가린다.
    if (dbStatus === 401 || dbStatus === 403) {
      return {
        ok: false,
        status: dbStatus,
        stage: "auth",
        error: lookupErrorMessage(dbStatus, errorMessage(dbErr)),
      };
    }

    try {
      const ds = await notion.dataSources.retrieve({ data_source_id: inputId });
      return {
        ok: true,
        dataSourceId: ds.id,
        dataSourceName: "title" in ds ? (ds.title[0]?.plain_text ?? "") : "",
        schema: ds.properties,
      };
    } catch {
      // 둘 다 실패했으면 원래(데이터베이스) 오류가 사용자에게 더 유용하다.
      return {
        ok: false,
        status: dbStatus,
        stage: stageForStatus(dbStatus),
        error: lookupErrorMessage(dbStatus, errorMessage(dbErr)),
      };
    }
  }
}
