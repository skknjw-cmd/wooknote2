/**
 * Notion 조회 실패의 상태 코드별 처리.
 * 라우트와 연결 테스트가 같은 문구를 쓰도록 여기 한 곳에서만 만든다.
 */

export function stageForStatus(status: number): "auth" | "schema" {
  return status === 401 || status === 403 ? "auth" : "schema";
}

/** 상태 코드별 안내. 404는 통합 미초대가 가장 흔한 원인이라 그걸 앞세운다. */
export function lookupErrorMessage(status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return `Notion 토큰이 유효하지 않습니다. 설정에서 Internal Integration Token을 다시 확인하세요. (${detail})`;
  }
  if (status === 400) {
    return `ID 형식이 올바르지 않거나 데이터 소스가 일치하지 않습니다. 32자 ID 또는 Notion URL을 그대로 붙여넣었는지 확인하세요. (${detail})`;
  }
  return `데이터베이스를 찾을 수 없습니다. ID가 맞는지, 그리고 Notion에서 해당 DB 우측 상단 ⋯ → 연결로 통합(Integration)을 초대했는지 확인하세요. (${detail})`;
}
