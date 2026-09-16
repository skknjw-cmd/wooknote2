# Notion 연결 테스트·속성 매핑 UI 구현 계획 (Phase B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 화면에서 Notion 연결을 미리 확인하고, 앱의 각 필드를 어느 Notion 속성·어느 옵션에 넣을지 사용자가 고르게 한다. 속성 이름이 달라도 동작한다.

**Architecture:** 해석 로직과 오류 문구를 라우트에서 순수 모듈로 빼내 저장 경로와 연결 테스트 경로가 공유한다. 매핑은 localStorage에 한 벌 두고 소속 data source를 함께 기록하며, 저장 시 해석 결과와 다르면 무시하고 배너로 알린다. 매핑을 설정하지 않은 기존 사용자는 지금과 똑같이 동작한다.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19, `@notionhq/client@5.15.0`, vitest + jsdom

**Spec:** `docs/superpowers/specs/2026-09-15-notion-mapping-ui-design.md`

## Global Constraints

- **하위 호환이 최우선이다.** 매핑을 설정하지 않은 사용자(`fields` 미전달)는 지금과 완전히 동일하게 동작해야 한다. `filterProperties`의 기존 테스트 31개가 3번째 인자 없이 그대로 통과해야 한다.
- **문구는 한 곳에서 만든다.** 오류 안내는 `notionErrors.ts`가 유일한 출처이며, 라우트와 UI가 각자 만들지 않는다.
- **Phase A에서 이미 끝난 것은 건드리지 않는다:** data source 폴백, 401/403·400·404 구분, status 타입 지원(`resolveChoice`), append 간 350ms, `Notion-Version` 고정.
- **`(사용 안 함)`과 `(자동)`은 다른 뜻이다.** `fields`에 키가 없으면 하드코딩 이름으로 추정(기존 동작), `property: null`이면 일부러 건너뛰고 `skipped`에 넣지 않는다.
- **`resolveDataSource`와 두 라우트, 패널에는 단위 테스트를 붙이지 않는다.** 이 저장소에 목킹 패턴이 없어, 만들면 Notion의 실제 응답이 아니라 목 객체를 검증하게 된다. `tsc --noEmit`과 `npm run build`가 관문이고, 실제 검증은 Task 9의 수동 항목이다.
- **주석과 UI 문구는 한국어.**
- **테스트 기준선:** 이 계획 시작 시점 `npm test`는 **132개 중 131개 통과**다. 유일한 실패 `src/lib/meetingStorage.test.ts > round-trips a v2 save/load`는 `main`에서도 실패하는 기존 문제이므로 고치지 않는다.
- **커밋 메시지 끝에 붙일 것:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: 매핑 타입과 저장소

**Files:**
- Modify: `src/types/meeting.ts` (파일 끝 `── Notion 저장 ──` 블록에 추가)
- Modify: `src/lib/apiKey.ts` (Notion 섹션에 추가)
- Create: `src/lib/notionMapping.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `NotionFieldKey`, `NotionFieldMapping`, `NotionMappingConfig`, `getNotionMapping()`, `setNotionMapping()` — Task 4·7·8이 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notionMapping.test.ts` 생성:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getNotionMapping, setNotionMapping } from "./apiKey";
import type { NotionMappingConfig } from "@/types/meeting";

const sample: NotionMappingConfig = {
  dataSourceId: "ds-1",
  dataSourceName: "회의록",
  fields: {
    meetingDate: { property: "회의일자" },
    durationText: { property: null },
    status: { property: "진행", option: "대기" },
  },
};

describe("Notion 매핑 저장소", () => {
  beforeEach(() => localStorage.clear());

  it("저장한 값을 그대로 돌려준다", () => {
    setNotionMapping(sample);
    expect(getNotionMapping()).toEqual(sample);
  });

  it("값이 없으면 null", () => {
    expect(getNotionMapping()).toBeNull();
  });

  it("null을 저장하면 항목을 지운다", () => {
    setNotionMapping(sample);
    setNotionMapping(null);
    expect(localStorage.getItem("autonote_notion_mapping")).toBeNull();
    expect(getNotionMapping()).toBeNull();
  });

  it("손상된 JSON이면 null (저장이 막히면 안 된다)", () => {
    localStorage.setItem("autonote_notion_mapping", "{ 이건 JSON이 아님");
    expect(getNotionMapping()).toBeNull();
  });

  it("모양이 맞지 않으면 null", () => {
    localStorage.setItem("autonote_notion_mapping", JSON.stringify({ hello: "world" }));
    expect(getNotionMapping()).toBeNull();
  });

  it("fields가 없으면 null", () => {
    localStorage.setItem("autonote_notion_mapping", JSON.stringify({ dataSourceId: "ds-1" }));
    expect(getNotionMapping()).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionMapping.test.ts`
Expected: FAIL — `getNotionMapping is not a function`

- [ ] **Step 3: 타입 추가**

`src/types/meeting.ts`의 `NotionSaveState` 정의 **위**에 추가:

```ts
/** 매핑 가능한 앱 필드. 제목은 title 타입으로 찾으므로 제외한다. */
export type NotionFieldKey = "meetingDate" | "attendees" | "durationText" | "status" | "entryMethod";

export type NotionFieldMapping = {
  /** 넣을 Notion 속성 이름. null이면 이 필드를 일부러 쓰지 않는다. */
  property: string | null;
  /** select·status 속성일 때 넣을 옵션 이름. 값 속성에서는 쓰지 않는다. */
  option?: string | null;
};

/**
 * 속성 매핑 설정. 한 벌만 두고 어느 data source의 것인지 함께 기록한다.
 * 저장 시 해석된 data source와 다르면 통째로 무시하고 이름 추정으로 돌아간다.
 */
export type NotionMappingConfig = {
  dataSourceId: string;
  dataSourceName: string;
  fields: Partial<Record<NotionFieldKey, NotionFieldMapping>>;
};
```

`NotionSaveResponse`의 `ok: true` 변형에 추가:

```ts
      /** 매핑이 다른 data source의 것이라 무시됐는가. */
      mappingIgnored?: boolean;
```

`NotionSaveState`의 `saved` 변형에도 같은 필드를 추가:

```ts
  | { kind: "saved"; skippedProperties: string[]; mappingIgnored?: boolean }
```

- [ ] **Step 4: 저장소 함수 추가**

`src/lib/apiKey.ts` 맨 위 상수 블록에 추가:

```ts
const NOTION_MAPPING_KEY = "autonote_notion_mapping";
```

파일 상단 import에 타입을 추가한다 (`apiKey.ts`에 아직 import 문이 없으면 맨 첫 줄에 넣는다):

```ts
import type { NotionMappingConfig } from "@/types/meeting";
```

`notionKeyHeaders()` 아래에 추가:

```ts
/**
 * 저장된 속성 매핑. 없거나 모양이 깨졌으면 null을 돌려준다.
 * 손상된 설정 하나 때문에 회의 저장이 막히면 안 되므로 예외를 던지지 않는다.
 */
export function getNotionMapping(): NotionMappingConfig | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(NOTION_MAPPING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as NotionMappingConfig;
    if (!parsed || typeof parsed.dataSourceId !== "string") return null;
    if (!parsed.fields || typeof parsed.fields !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setNotionMapping(config: NotionMappingConfig | null) {
  if (!config) {
    localStorage.removeItem(NOTION_MAPPING_KEY);
    return;
  }
  localStorage.setItem(NOTION_MAPPING_KEY, JSON.stringify(config));
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionMapping.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src/types/meeting.ts src/lib/apiKey.ts src/lib/notionMapping.test.ts
git commit -m "$(cat <<'MSG'
feat(notion): 속성 매핑 타입과 localStorage 저장소 추가

매핑은 한 벌만 두고 소속 data source를 함께 기록한다. 손상된 JSON이면
null을 돌려줘 회의 저장이 막히지 않게 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: `notionErrors.ts` — 오류 문구를 순수 모듈로

**Files:**
- Create: `src/lib/notionErrors.ts`
- Create: `src/lib/notionErrors.test.ts`
- Modify: `src/app/api/notion/route.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `stageForStatus(status)`, `lookupErrorMessage(status, detail)` — Task 5·6이 사용한다.

Phase A가 `route.ts` 안에 인라인으로 넣은 문구 선택 로직을 옮긴다. SDK를 import하지 않으므로 테스트가 가볍다. **문구는 지금 `route.ts`에 있는 것과 한 글자도 다르지 않아야 한다** — 사용자가 보던 안내가 바뀌면 안 된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notionErrors.test.ts` 생성:

```ts
import { describe, it, expect } from "vitest";
import { stageForStatus, lookupErrorMessage } from "./notionErrors";

describe("stageForStatus", () => {
  it("401·403은 auth", () => {
    expect(stageForStatus(401)).toBe("auth");
    expect(stageForStatus(403)).toBe("auth");
  });

  it("나머지는 schema", () => {
    expect(stageForStatus(400)).toBe("schema");
    expect(stageForStatus(404)).toBe("schema");
    expect(stageForStatus(500)).toBe("schema");
  });
});

describe("lookupErrorMessage", () => {
  it("401은 토큰 확인을 안내한다", () => {
    const m = lookupErrorMessage(401, "unauthorized");
    expect(m).toContain("토큰");
    expect(m).toContain("Internal Integration Token");
    expect(m).toContain("unauthorized");
  });

  it("403도 401과 같은 안내", () => {
    expect(lookupErrorMessage(403, "x")).toBe(lookupErrorMessage(401, "x"));
  });

  it("400은 ID 형식·데이터 소스 불일치를 안내한다", () => {
    const m = lookupErrorMessage(400, "bad id");
    expect(m).toContain("형식");
    expect(m).toContain("bad id");
    expect(m).not.toContain("초대");
  });

  it("404는 통합 초대를 앞세운다 (가장 흔한 원인)", () => {
    const m = lookupErrorMessage(404, "not found");
    expect(m).toContain("초대");
    expect(m).toContain("연결");
    expect(m).toContain("not found");
  });

  it("500도 404와 같은 안내로 떨어진다", () => {
    expect(lookupErrorMessage(500, "x")).toBe(lookupErrorMessage(404, "x"));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionErrors.test.ts`
Expected: FAIL — `Failed to resolve import "./notionErrors"`

- [ ] **Step 3: 구현 작성**

`src/lib/notionErrors.ts` 생성. 문구는 현재 `route.ts`의 `lookupErrorMessage`에서 그대로 옮긴다:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionErrors.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 라우트가 새 모듈을 쓰도록 교체**

`src/app/api/notion/route.ts`에서 로컬 `lookupErrorMessage` 함수 정의를 **삭제**하고 import로 바꾼다:

```ts
import { lookupErrorMessage, stageForStatus } from "@/lib/notionErrors";
```

호출부의 인자도 맞춘다. 지금은 `lookupErrorMessage(status, err)`처럼 에러 객체를 넘기고 있으므로 `errorMessage(err)`를 거쳐 문자열로 만들어 넘긴다:

```ts
        { ok: false, stage: "auth", error: lookupErrorMessage(dbStatus, errorMessage(dbErr)) },
```

`stage` 계산도 `stageForStatus`를 쓰도록 정리한다. `errorMessage`와 `httpStatus` 헬퍼는 라우트에 그대로 둔다.

- [ ] **Step 6: 타입 체크와 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음

- [ ] **Step 7: 전체 스위트**

Run: `npm test`
Expected: **145개 중 144개 통과** (기준선 132 + Task 1의 6 + 이번 7). 유일한 실패는 `meetingStorage.test.ts`여야 한다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/notionErrors.ts src/lib/notionErrors.test.ts src/app/api/notion/route.ts
git commit -m "$(cat <<'MSG'
refactor(notion): 오류 문구를 순수 모듈로 분리하고 테스트 추가

라우트 안에 인라인으로 있던 상태 코드별 안내를 notionErrors.ts로 옮긴다.
연결 테스트 라우트가 같은 문구를 쓰게 되며, 401/400/404 분기에 없던
테스트가 생긴다. 문구 자체는 바뀌지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: `listProperties` — 스키마를 UI용 목록으로

**Files:**
- Modify: `src/lib/notionBlocks.ts`
- Modify: `src/lib/notionBlocks.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `NotionPropertyInfo`, `listProperties(schema)`, 확장된 `NotionPropertySchema` — Task 6·8이 사용한다.

Phase A에서 `NotionPropertySchema`에 `status`만 추가했다. 연결 테스트가 select 옵션도 드롭다운에 채워야 하므로 `select`를 더한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notionBlocks.test.ts` **끝에 추가**:

```ts
import { listProperties } from "./notionBlocks";

describe("listProperties", () => {
  it("빈 스키마는 빈 배열", () => {
    expect(listProperties({})).toEqual([]);
  });

  it("이름과 타입을 보존한다", () => {
    const out = listProperties({ 이름: { type: "title" }, 회의일자: { type: "date" } });
    expect(out).toEqual([
      { name: "이름", type: "title" },
      { name: "회의일자", type: "date" },
    ]);
  });

  it("select는 옵션 이름을 뽑는다", () => {
    const out = listProperties({
      진행: { type: "select", select: { options: [{ name: "대기" }, { name: "완료" }] } },
    });
    expect(out).toEqual([{ name: "진행", type: "select", options: ["대기", "완료"] }]);
  });

  it("status도 옵션 이름을 뽑는다", () => {
    const out = listProperties({
      상태: { type: "status", status: { options: [{ name: "시작 전" }, { name: "진행 중" }] } },
    });
    expect(out).toEqual([{ name: "상태", type: "status", options: ["시작 전", "진행 중"] }]);
  });

  it("옵션이 없는 타입에는 options 키를 넣지 않는다", () => {
    const out = listProperties({ 참석자: { type: "rich_text" } });
    expect(out[0]).not.toHaveProperty("options");
  });

  it("select인데 options가 비어 있으면 빈 배열", () => {
    const out = listProperties({ 진행: { type: "select", select: { options: [] } } });
    expect(out).toEqual([{ name: "진행", type: "select", options: [] }]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: FAIL — `listProperties is not a function`

- [ ] **Step 3: 스키마 타입 확장과 구현**

`src/lib/notionBlocks.ts`의 `NotionPropertySchema`를 아래로 교체한다 (`select`를 추가):

```ts
/** dataSources.retrieve()가 돌려주는 속성 스키마 중 이 코드가 쓰는 부분만. */
export type NotionPropertySchema = Record<
  string,
  {
    type: string;
    /** select 타입일 때만 존재. 드롭다운에 채울 옵션. */
    select?: { options?: Array<{ name: string }> };
    /** status 타입일 때만 존재. API로 새 옵션을 만들 수 없어 기존 옵션과 대조해야 한다. */
    status?: { options?: Array<{ name: string }> };
  }
>;

/** 설정 화면 드롭다운이 쓰는 속성 정보. */
export type NotionPropertyInfo = {
  name: string;
  type: string;
  /** select·status일 때만. */
  options?: string[];
};

/** 스키마를 설정 화면이 쓸 목록으로 바꾼다. */
export function listProperties(schema: NotionPropertySchema): NotionPropertyInfo[] {
  return Object.entries(schema).map(([name, prop]) => {
    const options =
      prop.type === "select" ? prop.select?.options
      : prop.type === "status" ? prop.status?.options
      : undefined;
    return options
      ? { name, type: prop.type, options: options.map((o) => o.name) }
      : { name, type: prop.type };
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: PASS — 기존 31개 + 신규 6개

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. `route.ts`의 `const schema: NotionPropertySchema = ds.properties`가 여전히 통과해야 한다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/notionBlocks.ts src/lib/notionBlocks.test.ts
git commit -m "$(cat <<'MSG'
feat(notion): 스키마를 드롭다운용 목록으로 바꾸는 listProperties 추가

select 옵션도 뽑아야 해서 NotionPropertySchema에 select를 더한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: `filterProperties`에 매핑 적용

**Files:**
- Modify: `src/lib/notionBlocks.ts`
- Modify: `src/lib/notionBlocks.test.ts`

**Interfaces:**
- Consumes: `NotionFieldKey`, `NotionFieldMapping` (Task 1)
- Produces: `filterProperties(schema, payload, fields?)` — Task 7이 3번째 인자를 넘긴다.

**이 작업의 핵심 제약:** 3번째 인자를 넘기지 않으면 **기존 테스트 31개가 한 줄도 고치지 않고 통과**해야 한다. 기존 테스트를 수정하는 것은 하위 호환이 깨졌다는 신호다 — 그런 일이 생기면 멈추고 보고한다.

**필드별 동작:**

| `fields[key]` | 동작 |
|---|---|
| 없음 | 하드코딩 이름으로 찾고 타입 검사 (기존 동작) |
| `{ property: null }` | 건너뜀. `skipped`에 **넣지 않음** |
| `{ property: "회의일자" }` | 그 속성에 넣음. 타입 불일치면 `회의일시(→회의일자: date 아님)` |
| `{ property: "진행", option: "대기" }` | 선택형. `resolveChoice`가 select/status를 판별 |

옵션 이름은 `fields[key].option`에서 가져오고, 없으면 지금의 기본값(`상태` → `"분석대기"`, `입력방식` → `payload.entryMethod`)으로 떨어진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notionBlocks.test.ts` **끝에 추가**. `payload`와 `fullSchema`는 파일 위쪽에 이미 있으므로 다시 만들지 않는다:

```ts
import type { NotionFieldKey, NotionFieldMapping } from "@/types/meeting";

type Fields = Partial<Record<NotionFieldKey, NotionFieldMapping>>;

describe("filterProperties — 매핑", () => {
  it("fields를 넘기지 않으면 기존 동작 그대로", () => {
    const without = filterProperties(fullSchema, payload);
    const withNull = filterProperties(fullSchema, payload, null);
    expect(withNull).toEqual(without);
  });

  it("키가 없는 필드는 하드코딩 이름으로 찾는다", () => {
    const fields: Fields = { status: { property: null } };
    const { properties } = filterProperties(fullSchema, payload, fields);
    expect(properties["회의일시"]).toEqual({ date: { start: "2026-09-15" } });
  });

  it("property가 null이면 채우지 않고 skipped에도 넣지 않는다", () => {
    const fields: Fields = { durationText: { property: null } };
    const { properties, skipped } = filterProperties(fullSchema, payload, fields);
    expect(properties["소요시간"]).toBeUndefined();
    expect(skipped.some((s) => s.startsWith("소요시간"))).toBe(false);
  });

  it("매핑된 이름의 속성에 넣는다", () => {
    const schema = { 이름: { type: "title" }, 회의일자: { type: "date" } };
    const fields: Fields = { meetingDate: { property: "회의일자" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["회의일자"]).toEqual({ date: { start: "2026-09-15" } });
    expect(properties["회의일시"]).toBeUndefined();
  });

  it("매핑 대상 속성이 스키마에 없으면 이유와 함께 skipped", () => {
    const schema = { 이름: { type: "title" } };
    const fields: Fields = { meetingDate: { property: "없는속성" } };
    const { skipped } = filterProperties(schema, payload, fields);
    expect(skipped).toContain("회의일시(→없는속성: date 아님)");
  });

  it("매핑 대상의 타입이 안 맞으면 이유와 함께 skipped", () => {
    const schema = { 이름: { type: "title" }, 메모: { type: "rich_text" } };
    const fields: Fields = { meetingDate: { property: "메모" } };
    const { properties, skipped } = filterProperties(schema, payload, fields);
    expect(properties["메모"]).toBeUndefined();
    expect(skipped).toContain("회의일시(→메모: date 아님)");
  });

  it("선택형에 옵션을 지정하면 그 옵션을 넣는다 (select)", () => {
    const schema = { 이름: { type: "title" }, 진행: { type: "select" } };
    const fields: Fields = { status: { property: "진행", option: "대기" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["진행"]).toEqual({ select: { name: "대기" } });
  });

  it("선택형에 옵션을 지정하면 그 옵션을 넣는다 (status, 옵션 존재)", () => {
    const schema = {
      이름: { type: "title" },
      진행: { type: "status", status: { options: [{ name: "대기" }, { name: "완료" }] } },
    };
    const fields: Fields = { status: { property: "진행", option: "대기" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["진행"]).toEqual({ status: { name: "대기" } });
  });

  it("status 옵션이 없으면 매핑해도 건너뛰고 이유를 남긴다", () => {
    const schema = {
      이름: { type: "title" },
      진행: { type: "status", status: { options: [{ name: "완료" }] } },
    };
    const fields: Fields = { status: { property: "진행", option: "대기" } };
    const { properties, skipped } = filterProperties(schema, payload, fields);
    expect(properties["진행"]).toBeUndefined();
    expect(skipped).toContain('상태(→진행: status 옵션 "대기" 없음)');
  });

  it("옵션을 지정하지 않으면 기본값으로 떨어진다", () => {
    const schema = { 이름: { type: "title" }, 진행: { type: "select" } };
    const fields: Fields = { status: { property: "진행" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["진행"]).toEqual({ select: { name: "분석대기" } });
  });

  it("입력방식도 매핑된다", () => {
    const schema = { 이름: { type: "title" }, 방식: { type: "select" } };
    const fields: Fields = { entryMethod: { property: "방식", option: "라이브" } };
    const { properties } = filterProperties(schema, payload, fields);
    expect(properties["방식"]).toEqual({ select: { name: "라이브" } });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: FAIL — 매핑 케이스들이 실패한다. **기존 31개와 Task 3의 6개는 계속 통과해야 한다.**

- [ ] **Step 3: 구현 교체**

`src/lib/notionBlocks.ts`의 import에 타입을 추가한다:

```ts
import type { NotionMeetingPayload, NotionFieldKey, NotionFieldMapping } from "@/types/meeting";
```

`filterProperties`를 아래로 교체한다. `resolveChoice`는 Phase A의 것을 그대로 둔다:

```ts
/** skipped에 남길 문자열. 매핑된 경우 어느 속성을 노렸는지 함께 적는다. */
function skipLabel(fieldLabel: string, target: string | null, reason: string): string {
  if (target === null) return reason ? `${fieldLabel}(${reason})` : fieldLabel;
  return `${fieldLabel}(→${target}${reason ? `: ${reason}` : ""})`;
}

/**
 * 데이터 소스 스키마에 실제로 존재하고 타입까지 맞는 속성만 남긴다.
 * title은 이름이 DB마다 다르므로(한글 "이름", 영문 "Name") 타입으로 찾는다.
 *
 * fields를 넘기면 앱 필드를 사용자가 고른 속성·옵션에 넣는다. 넘기지 않으면
 * 하드코딩 이름으로 추정하는 기존 동작을 그대로 쓴다.
 */
export function filterProperties(
  schema: NotionPropertySchema,
  payload: NotionMeetingPayload,
  fields?: Partial<Record<NotionFieldKey, NotionFieldMapping>> | null,
): { properties: Record<string, unknown>; skipped: string[] } {
  const properties: Record<string, unknown> = {};
  const skipped: string[] = [];

  // title: 타입으로 탐색
  const titleName = Object.keys(schema).find((k) => schema[k].type === "title");
  if (titleName) {
    properties[titleName] = { title: [{ text: { content: payload.title } }] };
  } else {
    skipped.push("이름(title)");
  }

  const attendeesText = payload.attendees.join(", ");

  // 값 속성 (date / rich_text)
  const valuePlans: Array<{
    key: NotionFieldKey;
    name: string;
    type: string;
    value: unknown | null;
  }> = [
    { key: "meetingDate", name: "회의일시", type: "date", value: payload.meetingDate ? { date: { start: payload.meetingDate } } : null },
    { key: "attendees", name: "참석자", type: "rich_text", value: attendeesText ? { rich_text: [{ text: { content: attendeesText } }] } : null },
    { key: "durationText", name: "소요시간", type: "rich_text", value: payload.durationText ? { rich_text: [{ text: { content: payload.durationText } }] } : null },
  ];

  for (const plan of valuePlans) {
    if (plan.value === null) continue; // 값이 없으면 조용히 건너뜀
    const m = fields?.[plan.key];
    if (m && m.property === null) continue; // 일부러 쓰지 않는 필드
    const target = m?.property ?? plan.name;
    if (schema[target]?.type === plan.type) {
      properties[target] = plan.value;
    } else {
      skipped.push(skipLabel(plan.name, m ? target : null, m ? `${plan.type} 아님` : ""));
    }
  }

  // 선택형 속성 (select 또는 status). skipped 순서는 위 목록 뒤를 잇는다.
  const choicePlans: Array<{ key: NotionFieldKey; name: string; defaultOption: string | null }> = [
    { key: "status", name: "상태", defaultOption: "분석대기" },
    { key: "entryMethod", name: "입력방식", defaultOption: payload.entryMethod || null },
  ];

  for (const plan of choicePlans) {
    const m = fields?.[plan.key];
    if (m && m.property === null) continue; // 일부러 쓰지 않는 필드
    const optionName = m?.option ?? plan.defaultOption;
    if (!optionName) continue; // 넣을 값이 없으면 조용히 건너뜀
    const target = m?.property ?? plan.name;
    const resolved = resolveChoice(schema[target], optionName);
    if ("value" in resolved) {
      properties[target] = resolved.value;
    } else {
      skipped.push(skipLabel(plan.name, m ? target : null, resolved.reason));
    }
  }

  return { properties, skipped };
}
```

> `skipLabel`의 `target`이 `null`이면 "매핑 없음"이라는 뜻이고, 그때는 기존과 똑같이 `상태` 또는 `상태(status 옵션 "분석대기" 없음)`이 된다. 매핑이 있으면 `→속성명`이 붙는다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: PASS — 기존 31 + Task 3의 6 + 이번 11 = 48개

**기존 31개 중 하나라도 고쳐야 통과한다면 멈추고 보고한다.** 하위 호환이 깨졌다는 뜻이다.

- [ ] **Step 5: 전체 스위트와 타입 체크**

Run: `npm test && npx tsc --noEmit`
Expected: 유일한 실패는 `meetingStorage.test.ts`

- [ ] **Step 6: 커밋**

```bash
git add src/lib/notionBlocks.ts src/lib/notionBlocks.test.ts
git commit -m "$(cat <<'MSG'
feat(notion): filterProperties가 사용자 지정 매핑을 따르도록 확장

3번째 인자를 넘기지 않으면 기존 동작 그대로다. 매핑이 있으면 지정된
속성·옵션에 넣고, 실패 시 어느 속성을 노렸는지 skipped에 함께 남긴다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: `notionResolve.ts` — 해석 로직 추출

**Files:**
- Create: `src/lib/notionResolve.ts`
- Modify: `src/app/api/notion/route.ts`

**Interfaces:**
- Consumes: `lookupErrorMessage`, `stageForStatus` (Task 2), `NotionPropertySchema` (Task 3)
- Produces: `ResolveResult`, `resolveDataSource(notion, inputId)` — Task 6이 사용한다.

Phase A의 폴백을 `route.ts`에서 그대로 옮긴다. **동작을 바꾸지 않는다** — 순수한 이동이다.

- [ ] **Step 1: 모듈 작성**

`src/lib/notionResolve.ts` 생성:

```ts
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
```

- [ ] **Step 2: 라우트가 새 모듈을 쓰도록 교체**

`src/app/api/notion/route.ts`에서 해석 블록(`databases.retrieve` ~ 폴백 `catch`)을 통째로 아래로 바꾼다:

```ts
  const resolved = await resolveDataSource(notion, databaseId);
  if (!resolved.ok) {
    return NextResponse.json<NotionSaveResponse>(
      { ok: false, stage: resolved.stage, error: resolved.error },
      { status: resolved.status },
    );
  }
  const { dataSourceId, dataSourceName } = resolved;
```

이후 스키마 조회는 `resolved.schema`를 우선 쓴다:

```ts
    const schema: NotionPropertySchema =
      resolved.schema ??
      (await notion.dataSources.retrieve({ data_source_id: dataSourceId })).properties;
```

더 이상 쓰이지 않는 `schemaFromFallback` 변수와 `lookupErrorMessage` import를 정리한다. `errorMessage`와 `httpStatus`는 남은 catch 블록이 쓰므로 그대로 둔다.

- [ ] **Step 3: 타입 체크와 빌드**

Run: `npx tsc --noEmit && npx eslint src/app/api/notion/route.ts src/lib/notionResolve.ts && npm run build`
Expected: 에러 없음

- [ ] **Step 4: 전체 스위트**

Run: `npm test`
Expected: 변동 없음 (테스트를 추가하지 않았다)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/notionResolve.ts src/app/api/notion/route.ts
git commit -m "$(cat <<'MSG'
refactor(notion): data source 해석을 notionResolve로 분리

저장 경로와 연결 테스트 경로가 같은 폴백·같은 오류 문구를 쓰게 한다.
동작은 바뀌지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: `/api/notion/schema` 연결 테스트 라우트

**Files:**
- Create: `src/app/api/notion/schema/route.ts`
- Modify: `src/types/meeting.ts` (응답 타입 추가)

**Interfaces:**
- Consumes: `resolveDataSource` (Task 5), `listProperties`, `NotionPropertyInfo` (Task 3)
- Produces: `POST /api/notion/schema`, `NotionSchemaResponse` — Task 8이 호출한다.

**의미상 GET이 맞지만 POST로 둔다.** 자격증명이 헤더에 실리는데 GET은 중간 캐시나 프록시 로그에 남을 여지가 더 크다.

- [ ] **Step 1: 응답 타입 추가**

`src/types/meeting.ts`의 Notion 블록에 추가:

```ts
/** POST /api/notion/schema 응답. */
export type NotionSchemaResponse =
  | {
      ok: true;
      dataSourceId: string;
      dataSourceName: string;
      properties: Array<{ name: string; type: string; options?: string[] }>;
    }
  | { ok: false; stage: "auth" | "schema"; error: string };
```

- [ ] **Step 2: 라우트 작성**

`src/app/api/notion/schema/route.ts` 생성:

```ts
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
```

- [ ] **Step 3: 타입 체크와 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 빌드 출력에 `/api/notion/schema`가 나타난다

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/notion/schema/route.ts src/types/meeting.ts
git commit -m "$(cat <<'MSG'
feat(notion): 연결 테스트 라우트 /api/notion/schema 추가

저장하지 않고 DB 제목과 속성 목록만 돌려준다. 저장 경로와 같은
resolveDataSource를 써서 폴백과 오류 문구가 갈라지지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: 매핑을 저장 요청에 싣고 배너까지 전달

**Files:**
- Modify: `src/lib/notionSave.ts`
- Modify: `src/app/api/notion/route.ts`
- Modify: `src/components/Layout/AppShell.tsx`

**Interfaces:**
- Consumes: `getNotionMapping` (Task 1), `filterProperties(…, fields)` (Task 4), `resolveDataSource` (Task 5)
- Produces: 본문 `{ meeting, mapping }`, 응답의 `mappingIgnored` — Task 8이 설정 화면에서 이 흐름을 채운다.

**요청 본문 구조가 바뀐다.** 지금은 `NotionMeetingPayload` 그 자체인데, 매핑은 회의 데이터가 아니라 설정이므로 섞지 않고 나란히 둔다. 클라이언트와 라우트를 **같이** 고쳐야 빌드가 깨지지 않는다.

- [ ] **Step 1: 클라이언트가 매핑을 함께 보내도록 수정**

`src/lib/notionSave.ts`의 import에 추가:

```ts
import { hasNotionConfig, notionKeyHeaders, getNotionMapping } from "@/lib/apiKey";
```

`pushToNotion`의 `body`를 아래로 바꾼다:

```ts
      body: JSON.stringify({
        meeting: noteToNotionPayload(note),
        mapping: getNotionMapping(),
      }),
```

성공 분기에서 `mappingIgnored`를 상태로 전달한다:

```ts
    if (data.ok) {
      return {
        kind: "saved",
        skippedProperties: data.skippedProperties,
        mappingIgnored: data.mappingIgnored,
      };
    }
```

- [ ] **Step 2: 라우트가 새 본문을 읽고 매핑을 적용하도록 수정**

`src/app/api/notion/route.ts`에서 본문 파싱을 바꾼다:

```ts
import type { NotionMeetingPayload, NotionMappingConfig, NotionSaveResponse } from "@/types/meeting";

  const body = (await req.json()) as {
    meeting: NotionMeetingPayload;
    mapping?: NotionMappingConfig | null;
  };
  const payload = body.meeting;
  const mapping = body.mapping ?? null;
```

이후 `payload`를 쓰던 곳은 그대로 둔다.

해석이 끝난 뒤, 매핑이 이 data source의 것인지 판단한다:

```ts
  // 매핑이 다른 data source의 것이면 쓰지 않는다. 속성 이름이 우연히 겹치면
  // 엉뚱한 곳에 값이 들어가고, 사용자는 왜 그런지 알 수 없다.
  const mappingUsable = !!mapping && mapping.dataSourceId === dataSourceId;
  const mappingIgnored = !!mapping && !mappingUsable;
```

`filterProperties` 호출에 3번째 인자를 넘긴다:

```ts
    const filtered = filterProperties(schema, payload, mappingUsable ? mapping.fields : null);
```

성공 응답에 실어 보낸다:

```ts
  return NextResponse.json<NotionSaveResponse>({
    ok: true,
    pageId,
    totalBlocks,
    skippedProperties,
    dataSourceName,
    mappingIgnored,
  });
```

- [ ] **Step 3: 배너가 매핑 무시를 알리도록 수정**

`src/components/Layout/AppShell.tsx`의 `saved` 분기를 아래로 교체한다:

```tsx
    case "saved": {
      const parts: string[] = [];
      if (status.skippedProperties.length > 0) parts.push(`건너뛴 속성: ${status.skippedProperties.join(", ")}`);
      if (status.mappingIgnored) parts.push("매핑이 다른 데이터베이스의 것이라 무시했습니다 — 설정에서 다시 연결 테스트를 해주세요");
      return {
        ico: "✅",
        text: parts.length > 0
          ? <span><b>저장 완료</b> · Notion에 기록됨 ({parts.join(" / ")})</span>
          : <span><b>저장 완료</b> · Notion에 기록됨</span>,
      };
    }
```

- [ ] **Step 4: 타입 체크, 린트, 빌드**

Run: `npx tsc --noEmit && npx eslint src/lib/notionSave.ts src/app/api/notion/route.ts src/components/Layout/AppShell.tsx && npm run build`
Expected: 에러 없음

- [ ] **Step 5: 전체 스위트**

Run: `npm test`
Expected: 변동 없음. `notionSave.test.ts`의 `noteToNotionPayload` 테스트는 본문 구조와 무관하므로 그대로 통과해야 한다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/notionSave.ts src/app/api/notion/route.ts src/components/Layout/AppShell.tsx
git commit -m "$(cat <<'MSG'
feat(notion): 저장 요청에 매핑을 싣고 무시 여부를 배너로 알림

본문을 { meeting, mapping }으로 나눠 회의 데이터와 설정을 섞지 않는다.
매핑이 다른 data source의 것이면 쓰지 않고 mappingIgnored로 알린다 —
조용히 무시하면 사용자는 매핑이 왜 안 먹는지 알 방법이 없다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: `NotionConnectionPanel` — 연결 테스트와 매핑 UI

**Files:**
- Create: `src/components/Settings/NotionConnectionPanel.tsx`
- Modify: `src/components/Layout/ApiKeyModal.tsx`

**Interfaces:**
- Consumes: `POST /api/notion/schema` (Task 6), `getNotionMapping`/`setNotionMapping` (Task 1), 매핑 타입 (Task 1)
- Produces: 없음 (마지막 UI 작업)

**구현자가 알아야 할 것:**
- `ApiKeyModal.tsx`의 Notion 섹션은 현재 **314~369줄**이다. 토큰·DB ID 입력란까지 통째로 패널로 옮기고, 모달은 `<NotionConnectionPanel>` 한 줄로 대체한다.
- **저장 버튼은 모달의 [저장] 하나뿐이다.** 패널에 저장 버튼을 만들지 않는다. 패널은 매핑 상태를 `onMappingChange`로 올려보내고, 모달의 `handleSave`가 `setNotionMapping`을 호출한다.
- 연결 테스트는 **지금 입력란에 타이핑된** 토큰으로 해야 한다. 그래서 토큰·DB ID를 props로 받는다.
- 모달에 이미 `show` state(비밀번호 표시 토글)가 있다. 패널은 자체 `show`를 갖는다 — 모달의 것을 props로 끌어오면 결합이 늘어난다.

- [ ] **Step 1: 패널 컴포넌트 작성**

`src/components/Settings/NotionConnectionPanel.tsx` 생성:

```tsx
"use client";

import React, { useState } from "react";
import { extractDatabaseId } from "@/lib/apiKey";
import type {
  NotionFieldKey,
  NotionFieldMapping,
  NotionMappingConfig,
  NotionSchemaResponse,
} from "@/types/meeting";

type PropertyInfo = { name: string; type: string; options?: string[] };

interface Props {
  token: string;
  databaseId: string;
  mapping: NotionMappingConfig | null;
  onTokenChange: (v: string) => void;
  onDatabaseIdChange: (v: string) => void;
  onMappingChange: (m: NotionMappingConfig | null) => void;
}

/** 앱 필드와 그 필드가 받아들이는 Notion 속성 타입. */
const FIELDS: Array<{ key: NotionFieldKey; label: string; types: string[] }> = [
  { key: "meetingDate", label: "회의일시", types: ["date"] },
  { key: "attendees", label: "참석자", types: ["rich_text"] },
  { key: "durationText", label: "소요시간", types: ["rich_text"] },
  { key: "status", label: "상태", types: ["select", "status"] },
  { key: "entryMethod", label: "입력방식", types: ["select", "status"] },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", fontSize: 13,
  border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
  background: "var(--surface)", color: "var(--ink)", outline: "none",
  fontFamily: "var(--font-mono)", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  flex: 1, padding: "6px 8px", fontSize: 12,
  border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
  background: "var(--surface)", color: "var(--ink)", boxSizing: "border-box",
};

export default function NotionConnectionPanel({
  token, databaseId, mapping,
  onTokenChange, onDatabaseIdChange, onMappingChange,
}: Props) {
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { dataSourceId: string; dataSourceName: string; properties: PropertyInfo[] } | null
  >(null);
  const [staleNotice, setStaleNotice] = useState(false);

  const canTest = token.trim().length > 0 && databaseId.trim().length > 0 && !testing;

  async function handleTest() {
    setTesting(true);
    setError(null);
    setStaleNotice(false);
    try {
      const res = await fetch("/api/notion/schema", {
        method: "POST",
        headers: {
          "x-notion-token": token.trim(),
          "x-notion-db": extractDatabaseId(databaseId),
        },
      });
      const data = (await res.json().catch(() => null)) as NotionSchemaResponse | null;
      if (!data || typeof data.ok !== "boolean") {
        setError(`Notion 서버 응답을 해석하지 못했습니다. (HTTP ${res.status})`);
        setResult(null);
        return;
      }
      if (!data.ok) {
        setError(data.error);
        setResult(null);
        return;
      }
      setResult({
        dataSourceId: data.dataSourceId,
        dataSourceName: data.dataSourceName,
        properties: data.properties,
      });
      // 저장된 매핑이 다른 DB의 것이면 복원하지 않고 알린다.
      if (mapping && mapping.dataSourceId !== data.dataSourceId) {
        setStaleNotice(true);
        onMappingChange(null);
      }
    } catch {
      setError("서버에 연결할 수 없습니다.");
      setResult(null);
    } finally {
      setTesting(false);
    }
  }

  /** 드롭다운 한 칸을 바꾼다. result가 있어야만 호출된다. */
  function updateField(key: NotionFieldKey, next: NotionFieldMapping | undefined) {
    if (!result) return;
    const fields = { ...(mapping?.fields ?? {}) };
    if (next === undefined) delete fields[key];
    else fields[key] = next;
    onMappingChange({
      dataSourceId: result.dataSourceId,
      dataSourceName: result.dataSourceName,
      fields,
    });
  }

  const current = (key: NotionFieldKey): NotionFieldMapping | undefined => mapping?.fields?.[key];

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8 }}>
        Notion 연동
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>
            Internal Integration Token
          </div>
          <input
            type={show ? "text" : "password"}
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="ntn_..."
            style={inputStyle}
          />
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>
            데이터베이스 ID 또는 URL
          </div>
          <input
            type="text"
            value={databaseId}
            onChange={(e) => onDatabaseIdChange(e.target.value)}
            placeholder="https://notion.so/... 또는 32자 ID"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={handleTest}
          disabled={!canTest}
          style={{ fontSize: 12, padding: "5px 10px" }}
        >
          {testing ? "확인 중…" : "연결 테스트"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setShow((s) => !s)}
          style={{ fontSize: 12, padding: "5px 10px" }}
        >
          {show ? "토큰 숨기기" : "토큰 보기"}
        </button>
      </div>

      {error && (
        <div style={{
          fontSize: 11.5, color: "#ef4444", lineHeight: 1.6,
          background: "var(--surface-2)", borderRadius: "var(--r-sm)",
          padding: "8px 10px", marginTop: 10,
        }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
            ✓ <strong>{result.dataSourceName || "(제목 없음)"}</strong> · 속성 {result.properties.length}개
          </div>

          {staleNotice && (
            <div style={{
              fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6,
              background: "var(--surface-2)", borderRadius: "var(--r-sm)",
              padding: "8px 10px", marginBottom: 8,
            }}>
              다른 데이터베이스의 매핑이라 초기화했습니다. 다시 설정해 주세요.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {FIELDS.map((f) => {
              const m = current(f.key);
              const candidates = result.properties.filter((p) => f.types.includes(p.type));
              const chosen = result.properties.find((p) => p.name === m?.property);
              const value = m === undefined ? "__auto__" : m.property === null ? "__none__" : m.property;
              return (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)", width: 64, flexShrink: 0 }}>
                    {f.label}
                  </span>
                  <select
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__auto__") updateField(f.key, undefined);
                      else if (v === "__none__") updateField(f.key, { property: null });
                      else updateField(f.key, { property: v, option: null });
                    }}
                    style={selectStyle}
                  >
                    <option value="__auto__">(자동)</option>
                    <option value="__none__">(사용 안 함)</option>
                    {candidates.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  {chosen?.options && (
                    <select
                      value={m?.option ?? ""}
                      onChange={(e) =>
                        updateField(f.key, { property: chosen.name, option: e.target.value || null })
                      }
                      style={selectStyle}
                    >
                      <option value="">(옵션 선택)</option>
                      {chosen.options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{
        fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6,
        background: "var(--surface-2)", borderRadius: "var(--r-sm)",
        padding: "8px 10px", marginTop: 10,
      }}>
        회의가 끝나면 AI 분석 없이 이 데이터베이스에 바로 저장됩니다.
        Notion에서 <strong>해당 DB 우측 상단 ⋯ → 연결</strong>로 통합(Integration)을 초대해야 합니다.
        <strong>연결 테스트</strong>를 누르면 속성 목록을 읽어와 어느 속성에 넣을지 고를 수 있습니다.
        매핑을 설정하지 않으면 <code>회의일시</code> · <code>참석자</code> · <code>소요시간</code> ·{" "}
        <code>상태</code> · <code>입력방식</code> 이름으로 찾고, 없는 속성은 건너뜁니다.
        <code>상태</code>는 선택(Select)과 상태(Status) 타입을 모두 지원하며, Status는 API로 새 옵션을
        만들 수 없어 <strong>기존 옵션과 이름이 일치할 때만</strong> 채워집니다.
      </div>
    </div>
  );
}
```

> 마지막 안내 문구에서 "`상태`는 반드시 **선택(Select)** 타입으로 만드세요"라는 옛 문장이 사라졌다. Phase A에서 status를 지원하면서 사실이 아니게 되었기 때문이다.

- [ ] **Step 2: 모달이 패널을 쓰도록 교체**

`src/components/Layout/ApiKeyModal.tsx`에서:

(a) import 추가:

```ts
import NotionConnectionPanel from "@/components/Settings/NotionConnectionPanel";
import { getNotionMapping, setNotionMapping } from "@/lib/apiKey";
import type { NotionMappingConfig } from "@/types/meeting";
```

(b) 상태 추가 (기존 `notionDbId` 상태 아래):

```ts
  const [notionMapping, setNotionMappingState] = useState<NotionMappingConfig | null>(getNotionMapping());
```

(c) `handleSave` 안의 `setNotionDbId(notionDbId);` 아래에 추가:

```ts
    setNotionMapping(notionMapping);
```

(d) **314~369줄의 Notion 섹션 전체**(`{/* Notion 연동 */}` 부터 그 `</div>` 까지)를 아래로 교체:

```tsx
        <NotionConnectionPanel
          token={notionToken}
          databaseId={notionDbId}
          mapping={notionMapping}
          onTokenChange={setNotionTokenState}
          onDatabaseIdChange={setNotionDbIdState}
          onMappingChange={setNotionMappingState}
        />
```

- [ ] **Step 3: 타입 체크, 린트, 빌드**

Run: `npx tsc --noEmit && npx eslint src/components/Settings/NotionConnectionPanel.tsx src/components/Layout/ApiKeyModal.tsx && npm run build`
Expected: 에러 없음

- [ ] **Step 4: 전체 스위트**

Run: `npm test`
Expected: 변동 없음

- [ ] **Step 5: 화면 확인**

Run: `npm run dev`
Expected: 설정(⚙️)에 "Notion 연동" 섹션이 있고, 토큰·DB ID 입력란과 [연결 테스트] 버튼이 보인다. 토큰이 비어 있으면 버튼이 비활성이다. 모달 하단에는 [취소] [저장]만 있고 **패널 안에는 저장 버튼이 없다.**

- [ ] **Step 6: 커밋**

```bash
git add src/components/Settings/NotionConnectionPanel.tsx src/components/Layout/ApiKeyModal.tsx
git commit -m "$(cat <<'MSG'
feat(notion): 연결 테스트와 속성 매핑 UI 추가

420줄이 넘던 설정 모달에서 Notion 부분을 패널로 분리한다. 연결 테스트가
스키마를 읽어오면 앱 필드를 어느 속성·어느 옵션에 넣을지 고를 수 있다.
저장 버튼은 모달의 [저장] 하나뿐이다.

"상태는 반드시 선택(Select)으로" 안내는 Phase A에서 status를 지원하면서
사실이 아니게 되어 함께 고쳤다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: README 정정과 수동 검증

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1~8 전부
- Produces: 없음

- [ ] **Step 1: README의 낡은 안내 정정**

`README.md` 51번째 줄 근처의 이 문장을 찾는다:

```
  - `상태`는 반드시 **선택(Select)** 타입으로 만드세요 — Notion 한국어 UI가 기본으로 만드는 상태(Status) 타입은 API가 옵션을 추가할 수 없어 건너뜁니다.
```

아래로 교체한다:

```markdown
  - `상태`는 선택(Select)과 상태(Status) 타입을 모두 지원합니다. Status는 API로 새 옵션을 만들 수 없어 **기존 옵션과 이름이 일치할 때만** 채워집니다.
  - 속성 이름이 다르면 설정의 **연결 테스트**를 눌러 어느 속성에 넣을지 직접 고를 수 있습니다.
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "$(cat <<'MSG'
docs: status 타입 지원과 속성 매핑을 README에 반영

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 3: 수동 검증 — 실제 Notion 계정 필요**

`resolveDataSource`, 두 라우트, 패널에는 단위 테스트가 없다(Global Constraints 참조). 아래는 실제 계정으로 확인해야 하며, **각 항목의 결과를 보고한다. 코드를 고치지 않는다** — 수정 여부는 별도로 판단한다.

1. **연결 테스트 성공** — 토큰과 DB URL을 넣고 [연결 테스트] → DB 제목과 속성 개수가 맞게 나오는지
2. **토큰 오류** — 토큰을 틀리게 → "토큰이 유효하지 않습니다" 문구
3. **통합 미초대** — 초대하지 않은 DB → "⋯ → 연결" 초대 안내
4. **data source ID 폴백** — data source ID를 붙여넣어도 연결 테스트가 성공하는지
5. **이름이 다른 속성 매핑** — 날짜 속성이 `회의일자`인 DB에서 `회의일시 → 회의일자`로 매핑하고 회의를 저장 → **실제로 날짜가 채워지는지** (겪은 사고의 해결 확인)
6. **status 옵션 매핑** — `상태`를 Status 타입으로 두고 기존 옵션(예: `진행 중`)에 매핑 → 값이 들어가는지
7. **(사용 안 함)** — `소요시간`을 `(사용 안 함)`으로 → 배너의 "건너뛴 속성"에 **나오지 않는지**
8. **매핑 무시** — 매핑을 저장한 뒤 DB ID를 다른 것으로 바꾸고 회의를 저장 → 배너에 "매핑이 다른 데이터베이스의 것이라 무시했습니다"가 뜨는지
9. **하위 호환** — 매핑을 한 번도 설정하지 않은 상태에서 회의를 저장 → 예전처럼 이름으로 찾아 채워지는지

---

## 자체 검토 결과

**스펙 커버리지:** §3 데이터 모델 → Task 1, §4.1 notionErrors → Task 2, §4.2 notionResolve → Task 5, §4.3 schema 라우트 → Task 6, §4.4 listProperties → Task 3, §4.5 본문 구조 → Task 7, §4.6 filterProperties 계약 → Task 4, §4.7 매핑 적용 판단 → Task 7, §5.1 컴포넌트 분리 → Task 8, §5.2 저장 주체 → Task 8, §5.3~5.5 화면·드롭다운·복원 → Task 8, §5.6 안내 문구 정정 → Task 8(모달)·Task 9(README), §6 에러 처리 → Task 6·8, §7 테스트 → Task 1~4·9. 빠진 요구사항 없음.

**의도적으로 스펙과 다르게 한 것:** 없음.

**타입 일관성:** `NotionPropertyInfo`(Task 3)와 `NotionSchemaResponse.properties`(Task 6)의 원소 모양이 같다 — 후자는 구조를 인라인으로 적어 `types/meeting.ts`가 `lib/notionBlocks.ts`를 import하지 않게 했다(타입 의존 방향을 한쪽으로 유지). `filterProperties`의 3번째 인자 타입은 Task 4에서 정의하고 Task 7이 `mapping.fields`를 그대로 넘긴다.

**하위 호환 검증 지점:** Task 4 Step 4에 "기존 31개 중 하나라도 고쳐야 통과하면 멈추고 보고"를 명시했다. 이것이 Global Constraints 첫 줄을 실행 중에 강제하는 장치다.
