# 분석 없는 Notion 직접 저장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회의 입력(live 녹음 / 텍스트 / 오디오 파일)이 끝나면 Gemini 분석 없이 트랜스크립트를 Notion 데이터베이스에 바로 저장한다. 분석은 사용자가 "다시 정리" 버튼을 누를 때만 실행된다.

**Architecture:** 순수 함수(`src/lib/notionBlocks.ts`)가 평평한 페이로드를 Notion 블록 배열과 속성 객체로 변환하고, 서버 라우트(`src/app/api/notion/route.ts`)가 Notion SDK 호출만 담당한다. 화자 이름 해석은 클라이언트가 끝내고, 저장은 IndexedDB → 로컬 폴더 → Notion 순서로 진행해 Notion이 실패해도 데이터가 남는다.

**Tech Stack:** Next.js 16 (App Router), TypeScript, `@notionhq/client@5.15.0`, vitest + jsdom

**Spec:** `docs/superpowers/specs/2026-09-15-notion-direct-save-design.md`

## Global Constraints

- **Notion SDK는 2025-09-03 API 버전이다.** 속성 스키마는 데이터베이스가 아니라 **데이터 소스**에 있다. `databases.retrieve({ database_id })` → `data_sources[0].id` → `dataSources.retrieve({ data_source_id })` → `properties` 순서로 접근한다. 페이지 생성의 부모는 `{ data_source_id }`다.
- **Notion API 제약:** 요청 1건당 자식 블록 **100개**, rich_text 1개당 **2000자**.
- **키 저장 위치:** 모든 API 자격 증명은 `localStorage`에만 둔다. 서버 환경변수에 넣지 않는다. 라우트는 요청 헤더로만 받는다.
- **테스트 실행:** `npm test` (vitest, `src/**/*.test.ts` 대상). 단일 파일은 `npx vitest run src/lib/notionBlocks.test.ts`.
- **주석/문구는 한국어.** 기존 코드베이스가 한국어 주석과 한국어 UI 문구를 쓴다.
- **삭제 금지:** `/api/analyze` 라우트, `applyAnalysis()`, `callAnalyze()`, `handleRegen()`, Gemini 토큰 과금 집계는 전부 남긴다. 수동 "다시 정리" 버튼이 계속 사용한다.
- **커밋 메시지 끝에 붙일 것:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: 타입 정의

**Files:**
- Modify: `src/types/meeting.ts` (파일 끝에 추가)

**Interfaces:**
- Consumes: 없음 (첫 작업). 기존 `EntryMethod` 타입을 재사용한다.
- Produces: `NotionMeetingPayload`, `NotionTurn`, `NotionSaveState`, `NotionSaveResponse` — Task 2~7이 전부 이 타입들을 import 한다.

이 작업은 타입만 추가하므로 실행 가능한 테스트가 없다. 타입 체크가 검증이다.

- [ ] **Step 1: 타입 추가**

`src/types/meeting.ts` 파일 **맨 끝**에 아래를 추가한다. 기존 `EntryMethod` 정의(파일 마지막 줄 근처)는 그대로 둔다.

```ts
// ── Notion 저장 ──

/** Notion 페이지 본문에 들어갈 발화 1개. speaker는 이미 실명으로 해석된 상태. */
export type NotionTurn = {
  speaker: string; // "김팀장" 또는 "화자 2"
  time: string;    // "00:12" — 빈 문자열 가능
  text: string;
};

/**
 * 클라이언트가 /api/notion 으로 보내는 페이로드.
 * NoteRecord를 그대로 보내지 않는 이유: audioBlob(Blob)은 JSON 직렬화가 불가능하고
 * 서버가 speakerMapping 해석 규칙을 알 필요도 없다.
 */
export type NotionMeetingPayload = {
  title: string;
  meetingDate: string;      // "2026-09-15" — Notion date 속성용 ISO date
  location?: string;
  attendees: string[];
  durationText: string;     // "1:23:45" — 빈 문자열 가능
  entryMethod: EntryMethod;
  turns: NotionTurn[];
};

/** /api/notion 응답. */
export type NotionSaveResponse =
  | {
      ok: true;
      pageId: string;
      totalBlocks: number;
      skippedProperties: string[];
      dataSourceName: string;
    }
  | {
      ok: false;
      stage: "append";
      pageId: string;
      savedBlocks: number;
      totalBlocks: number;
      error: string;
    }
  | {
      ok: false;
      stage: "auth" | "schema" | "create";
      error: string;
    };

/** 화면 배너가 표시하는 저장 상태. */
export type NotionSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; skippedProperties: string[] }
  | { kind: "partial"; savedBlocks: number; totalBlocks: number }
  | { kind: "unconfigured" }
  | { kind: "failed"; message: string };
```

- [ ] **Step 2: 타입 체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (기존 코드에 영향 없는 순수 추가)

- [ ] **Step 3: 커밋**

```bash
git add src/types/meeting.ts
git commit -m "$(cat <<'MSG'
feat(types): Notion 저장 페이로드/응답/상태 타입 추가

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: `splitText` — 2000자 분할

**Files:**
- Create: `src/lib/notionBlocks.ts`
- Create: `src/lib/notionBlocks.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `splitText(text: string, limit?: number): string[]` — Task 4의 `buildBlocks`가 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notionBlocks.test.ts` 생성:

```ts
import { describe, it, expect } from "vitest";
import { splitText } from "./notionBlocks";

describe("splitText", () => {
  it("한도 미만이면 1개로 반환한다", () => {
    expect(splitText("안녕하세요", 2000)).toEqual(["안녕하세요"]);
  });

  it("정확히 한도 길이면 1개로 반환한다", () => {
    const s = "가".repeat(2000);
    expect(splitText(s, 2000)).toEqual([s]);
  });

  it("한도를 1자 넘으면 2개로 쪼갠다", () => {
    const s = "가".repeat(2001);
    const out = splitText(s, 2000);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(2000);
    expect(out[1]).toBe("가");
    expect(out.join("")).toBe(s);
  });

  it("빈 문자열이면 빈 배열을 반환한다", () => {
    expect(splitText("", 2000)).toEqual([]);
  });

  it("limit 기본값은 2000이다", () => {
    expect(splitText("가".repeat(2001))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: FAIL — `Failed to resolve import "./notionBlocks"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/notionBlocks.ts` 생성:

```ts
/** Notion rich_text 1개의 최대 길이. */
export const NOTION_TEXT_LIMIT = 2000;

/** Notion 요청 1건당 최대 자식 블록 수. */
export const NOTION_BLOCK_LIMIT = 100;

/** 긴 문자열을 Notion rich_text 한도에 맞게 쪼갠다. 빈 문자열은 빈 배열. */
export function splitText(text: string, limit: number = NOTION_TEXT_LIMIT): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    out.push(text.slice(i, i + limit));
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/notionBlocks.ts src/lib/notionBlocks.test.ts
git commit -m "$(cat <<'MSG'
feat(notion): rich_text 2000자 분할 유틸 추가

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: `chunkBlocks` — 100개 단위 분할

**Files:**
- Modify: `src/lib/notionBlocks.ts`
- Modify: `src/lib/notionBlocks.test.ts`

**Interfaces:**
- Consumes: `NOTION_BLOCK_LIMIT` (Task 2)
- Produces: `chunkBlocks<T>(blocks: T[], size?: number): T[][]` — Task 6의 라우트가 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notionBlocks.test.ts` **끝에 추가**:

```ts
import { chunkBlocks } from "./notionBlocks";

describe("chunkBlocks", () => {
  const nums = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("빈 배열이면 빈 배열을 반환한다", () => {
    expect(chunkBlocks([], 100)).toEqual([]);
  });

  it("99개는 1덩어리다", () => {
    const out = chunkBlocks(nums(99), 100);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(99);
  });

  it("정확히 100개도 1덩어리다", () => {
    const out = chunkBlocks(nums(100), 100);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(100);
  });

  it("101개는 100 + 1 두 덩어리다", () => {
    const out = chunkBlocks(nums(101), 100);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(100);
    expect(out[1]).toEqual([100]);
  });

  it("250개는 100 + 100 + 50 세 덩어리다", () => {
    const out = chunkBlocks(nums(250), 100);
    expect(out.map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("size 기본값은 100이다", () => {
    expect(chunkBlocks(nums(101))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: FAIL — `chunkBlocks is not a function` (또는 import 에러)

- [ ] **Step 3: 최소 구현 작성**

`src/lib/notionBlocks.ts`의 `splitText` 아래에 추가:

```ts
/** 블록 배열을 Notion 요청 한도(기본 100개)에 맞게 나눈다. */
export function chunkBlocks<T>(blocks: T[], size: number = NOTION_BLOCK_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < blocks.length; i += size) {
    out.push(blocks.slice(i, i + size));
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/notionBlocks.ts src/lib/notionBlocks.test.ts
git commit -m "$(cat <<'MSG'
feat(notion): 블록 100개 단위 분할 유틸 추가

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: `buildBlocks` — 페이로드를 Notion 블록으로

**Files:**
- Modify: `src/lib/notionBlocks.ts`
- Modify: `src/lib/notionBlocks.test.ts`

**Interfaces:**
- Consumes: `splitText` (Task 2), `NotionMeetingPayload` / `NotionTurn` (Task 1)
- Produces: `buildBlocks(payload: NotionMeetingPayload): NotionBlock[]`, `type NotionBlock` — Task 6의 라우트가 사용한다.

**블록 구조 규칙:**
1. `heading_2` "회의 정보"
2. `paragraph` — 일시/장소/참석자/소요시간 중 **값이 있는 항목만** ` · `로 이음. 전부 비면 이 문단은 생략.
3. `heading_2` "트랜스크립트"
4. 발화마다 `paragraph`. 2000자를 넘으면 여러 문단으로 나뉘며 **첫 문단에만** 화자·시각 접두를 붙인다.

발화 문단의 rich_text 구성: `[화자명]`(bold) + `" 00:12  "`(시각 없으면 `" "`) + 본문

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notionBlocks.test.ts` **끝에 추가**:

```ts
import { buildBlocks } from "./notionBlocks";
import type { NotionMeetingPayload } from "@/types/meeting";

const basePayload: NotionMeetingPayload = {
  title: "주간 회의",
  meetingDate: "2026-09-15",
  location: "",
  attendees: [],
  durationText: "",
  entryMethod: "live",
  turns: [],
};

/** 문단 블록의 전체 평문을 이어붙여 반환 (검증 편의용). */
function plain(block: { paragraph?: { rich_text: Array<{ text: { content: string } }> } }): string {
  return (block.paragraph?.rich_text ?? []).map((r) => r.text.content).join("");
}

describe("buildBlocks", () => {
  it("발화가 없으면 헤딩 2개와 회의 정보 문단만 만든다", () => {
    const blocks = buildBlocks({ ...basePayload, attendees: ["김팀장"] });
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("heading_2");
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[2].type).toBe("heading_2");
  });

  it("회의 정보가 전부 비면 정보 문단을 생략한다", () => {
    const blocks = buildBlocks({ ...basePayload, meetingDate: "" });
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.type === "heading_2")).toBe(true);
  });

  it("값이 있는 항목만 가운뎃점으로 잇는다", () => {
    const blocks = buildBlocks({
      ...basePayload,
      location: "3층 회의실",
      attendees: ["김팀장", "이책임"],
      durationText: "1:23:45",
    });
    expect(plain(blocks[1])).toBe(
      "일시: 2026-09-15 · 장소: 3층 회의실 · 참석자: 김팀장, 이책임 · 소요시간: 1:23:45",
    );
  });

  it("발화 1개는 문단 1개가 되고 화자는 굵게 표시된다", () => {
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "김팀장", time: "00:12", text: "시작하겠습니다." }],
    });
    expect(blocks).toHaveLength(4);
    const last = blocks[3];
    expect(last.type).toBe("paragraph");
    expect(last.paragraph!.rich_text[0].text.content).toBe("[김팀장]");
    expect(last.paragraph!.rich_text[0].annotations).toEqual({ bold: true });
    expect(plain(last)).toBe("[김팀장] 00:12  시작하겠습니다.");
  });

  it("시각이 비면 접두에 시각을 넣지 않는다", () => {
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "화자 1", time: "", text: "내용" }],
    });
    expect(plain(blocks[3])).toBe("[화자 1] 내용");
  });

  it("2000자를 넘는 발화는 여러 문단으로 나뉘고 접두는 첫 문단에만 붙는다", () => {
    const long = "가".repeat(2500);
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "김팀장", time: "00:12", text: long }],
    });
    // 헤딩2 + 정보1 + 헤딩2 + 문단2
    expect(blocks).toHaveLength(5);
    expect(blocks[3].paragraph!.rich_text[0].text.content).toBe("[김팀장]");
    expect(blocks[4].paragraph!.rich_text[0].text.content).toBe("가".repeat(500));
    expect(blocks[4].paragraph!.rich_text[0].annotations).toBeUndefined();
  });

  it("빈 텍스트 발화는 건너뛴다", () => {
    const blocks = buildBlocks({
      ...basePayload,
      turns: [{ speaker: "김팀장", time: "00:12", text: "   " }],
    });
    expect(blocks).toHaveLength(3);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: FAIL — `buildBlocks is not a function`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/notionBlocks.ts` 맨 위에 import를 추가하고, 파일 끝에 구현을 추가:

```ts
import type { NotionMeetingPayload } from "@/types/meeting";

/** Notion 블록 요청 객체. SDK 타입 대신 필요한 모양만 정의한다. */
export type NotionRichText = {
  type: "text";
  text: { content: string };
  annotations?: { bold: true };
};

export type NotionBlock = {
  object: "block";
  type: "heading_2" | "paragraph";
  heading_2?: { rich_text: NotionRichText[] };
  paragraph?: { rich_text: NotionRichText[] };
};

function richText(content: string, bold = false): NotionRichText {
  const item: NotionRichText = { type: "text", text: { content } };
  if (bold) item.annotations = { bold: true };
  return item;
}

function heading(content: string): NotionBlock {
  return { object: "block", type: "heading_2", heading_2: { rich_text: [richText(content)] } };
}

function paragraph(rich: NotionRichText[]): NotionBlock {
  return { object: "block", type: "paragraph", paragraph: { rich_text: rich } };
}

/** 회의 정보 한 줄. 값이 있는 항목만 " · "로 잇는다. 전부 비면 빈 문자열. */
function meetingInfoLine(p: NotionMeetingPayload): string {
  const parts: string[] = [];
  if (p.meetingDate) parts.push(`일시: ${p.meetingDate}`);
  if (p.location) parts.push(`장소: ${p.location}`);
  if (p.attendees.length > 0) parts.push(`참석자: ${p.attendees.join(", ")}`);
  if (p.durationText) parts.push(`소요시간: ${p.durationText}`);
  return parts.join(" · ");
}

/**
 * 페이로드를 Notion 블록 배열로 변환한다.
 * 2000자를 넘는 발화는 여러 문단으로 나뉘며, 화자·시각 접두는 첫 문단에만 붙는다.
 */
export function buildBlocks(payload: NotionMeetingPayload): NotionBlock[] {
  const blocks: NotionBlock[] = [heading("회의 정보")];

  const info = meetingInfoLine(payload);
  if (info) blocks.push(paragraph([richText(info)]));

  blocks.push(heading("트랜스크립트"));

  for (const turn of payload.turns) {
    const body = turn.text.trim();
    if (!body) continue;

    const chunks = splitText(body);
    const prefix = turn.time ? ` ${turn.time}  ` : " ";

    chunks.forEach((chunk, i) => {
      if (i === 0) {
        blocks.push(paragraph([
          richText(`[${turn.speaker}]`, true),
          richText(`${prefix}${chunk}`),
        ]));
      } else {
        blocks.push(paragraph([richText(chunk)]));
      }
    });
  }

  return blocks;
}
```

> 주의: `splitText(body)`는 접두를 뺀 본문만 나눈다. 첫 문단은 접두 때문에 2000자를 조금 넘을 수 있지만, 한도는 rich_text **항목 1개당** 적용되므로 접두와 본문이 별개 항목인 이 구조에서는 문제가 없다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/notionBlocks.ts src/lib/notionBlocks.test.ts
git commit -m "$(cat <<'MSG'
feat(notion): 페이로드를 Notion 블록으로 변환하는 buildBlocks 추가

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: `filterProperties` — 데이터 소스 스키마 방어

**Files:**
- Modify: `src/lib/notionBlocks.ts`
- Modify: `src/lib/notionBlocks.test.ts`

**Interfaces:**
- Consumes: `NotionMeetingPayload` (Task 1)
- Produces: `filterProperties(schema, payload): { properties: Record<string, unknown>; skipped: string[] }` — Task 6의 라우트가 사용한다.

**동작:** Notion은 데이터 소스에 없는 속성 이름을 보내면 400을 던진다. 그래서 실제 스키마를 받아 **이름과 타입이 모두 일치하는 속성만** 남긴다. title 속성만은 이름이 아니라 **타입으로 찾는다** (한글 DB는 "이름", 영문 DB는 "Name").

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notionBlocks.test.ts` **끝에 추가**:

```ts
import { filterProperties } from "./notionBlocks";

const fullSchema = {
  이름: { type: "title" },
  회의일시: { type: "date" },
  참석자: { type: "rich_text" },
  소요시간: { type: "rich_text" },
  상태: { type: "select" },
  입력방식: { type: "select" },
};

const payload: NotionMeetingPayload = {
  title: "주간 회의",
  meetingDate: "2026-09-15",
  location: "3층",
  attendees: ["김팀장", "이책임"],
  durationText: "1:23:45",
  entryMethod: "live",
  turns: [],
};

describe("filterProperties", () => {
  it("모든 속성이 있으면 전부 채우고 skipped는 비어 있다", () => {
    const { properties, skipped } = filterProperties(fullSchema, payload);
    expect(skipped).toEqual([]);
    expect(properties["이름"]).toEqual({ title: [{ text: { content: "주간 회의" } }] });
    expect(properties["회의일시"]).toEqual({ date: { start: "2026-09-15" } });
    expect(properties["참석자"]).toEqual({ rich_text: [{ text: { content: "김팀장, 이책임" } }] });
    expect(properties["소요시간"]).toEqual({ rich_text: [{ text: { content: "1:23:45" } }] });
    expect(properties["상태"]).toEqual({ select: { name: "분석대기" } });
    expect(properties["입력방식"]).toEqual({ select: { name: "live" } });
  });

  it("title 속성은 이름이 아니라 타입으로 찾는다", () => {
    const { properties, skipped } = filterProperties({ Name: { type: "title" } }, payload);
    expect(properties["Name"]).toEqual({ title: [{ text: { content: "주간 회의" } }] });
    expect(skipped).toEqual(["회의일시", "참석자", "소요시간", "상태", "입력방식"]);
  });

  it("없는 속성은 제외하고 skipped에 담는다", () => {
    const schema = { 이름: { type: "title" }, 회의일시: { type: "date" } };
    const { properties, skipped } = filterProperties(schema, payload);
    expect(Object.keys(properties).sort()).toEqual(["이름", "회의일시"]);
    expect(skipped).toEqual(["참석자", "소요시간", "상태", "입력방식"]);
  });

  it("타입이 다르면 제외하고 skipped에 담는다", () => {
    const schema = { ...fullSchema, 회의일시: { type: "rich_text" } };
    const { skipped } = filterProperties(schema, payload);
    expect(skipped).toContain("회의일시");
  });

  it("값이 빈 항목은 속성이 있어도 채우지 않고 skipped에도 넣지 않는다", () => {
    const { properties, skipped } = filterProperties(fullSchema, {
      ...payload,
      durationText: "",
      attendees: [],
    });
    expect(properties["소요시간"]).toBeUndefined();
    expect(properties["참석자"]).toBeUndefined();
    expect(skipped).toEqual([]);
  });

  it("title 속성이 없으면 제목을 버리지 않고 skipped에 이름을 담는다", () => {
    const { properties, skipped } = filterProperties({ 회의일시: { type: "date" } }, payload);
    expect(Object.keys(properties)).toEqual(["회의일시"]);
    expect(skipped).toContain("이름(title)");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: FAIL — `filterProperties is not a function`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/notionBlocks.ts` 끝에 추가:

```ts
/** dataSources.retrieve()가 돌려주는 속성 스키마 중 이 코드가 쓰는 부분만. */
export type NotionPropertySchema = Record<string, { type: string }>;

type PropertyPlan = {
  /** 스키마에서 찾을 속성 이름 */
  name: string;
  /** 요구 타입 */
  type: string;
  /** 채울 값. null이면 값이 없어 건너뜀(skipped에 넣지 않음) */
  value: unknown | null;
};

/**
 * 데이터 소스 스키마에 실제로 존재하고 타입까지 맞는 속성만 남긴다.
 * title은 이름이 DB마다 다르므로(한글 "이름", 영문 "Name") 타입으로 찾는다.
 */
export function filterProperties(
  schema: NotionPropertySchema,
  payload: NotionMeetingPayload,
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
  const plans: PropertyPlan[] = [
    { name: "회의일시", type: "date", value: payload.meetingDate ? { date: { start: payload.meetingDate } } : null },
    { name: "참석자", type: "rich_text", value: attendeesText ? { rich_text: [{ text: { content: attendeesText } }] } : null },
    { name: "소요시간", type: "rich_text", value: payload.durationText ? { rich_text: [{ text: { content: payload.durationText } }] } : null },
    { name: "상태", type: "select", value: { select: { name: "분석대기" } } },
    { name: "입력방식", type: "select", value: payload.entryMethod ? { select: { name: payload.entryMethod } } : null },
  ];

  for (const plan of plans) {
    if (plan.value === null) continue; // 값이 없으면 조용히 건너뜀
    if (schema[plan.name]?.type === plan.type) {
      properties[plan.name] = plan.value;
    } else {
      skipped.push(plan.name);
    }
  }

  return { properties, skipped };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionBlocks.test.ts`
Expected: PASS (24 tests)

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 기존 테스트 포함 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/notionBlocks.ts src/lib/notionBlocks.test.ts
git commit -m "$(cat <<'MSG'
feat(notion): 데이터 소스 스키마 기반 속성 필터링 추가

DB에 없는 속성을 보내면 400이 나므로 실재하는 속성만 채우고,
건너뛴 속성 이름을 호출자에게 돌려준다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: `/api/notion` 라우트

**Files:**
- Create: `src/app/api/notion/route.ts`

**Interfaces:**
- Consumes: `buildBlocks`, `chunkBlocks`, `filterProperties`, `NotionPropertySchema`, `NotionBlock` (Task 2~5), `NotionMeetingPayload` / `NotionSaveResponse` (Task 1)
- Produces: `POST /api/notion` 엔드포인트 — Task 8의 클라이언트가 호출한다.

**참고할 기존 패턴:** `src/app/api/analyze/route.ts` — `maxDuration`, 헤더에서 키 읽기, `NextResponse.json`. 같은 모양을 따른다.

- [ ] **Step 1: 라우트 작성**

`src/app/api/notion/route.ts` 생성:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Client, APIResponseError } from "@notionhq/client";
import {
  buildBlocks,
  chunkBlocks,
  filterProperties,
  type NotionBlock,
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
    const schema = ds.properties as unknown as NotionPropertySchema;
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

/** buildBlocks의 반환 타입을 라우트가 직접 쓰지는 않지만, 타입 이름을 고정해 둔다. */
export type { NotionBlock };
```

- [ ] **Step 2: 타입 체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

> `properties as never` / `children as never`는 SDK의 매우 넓은 유니온 타입 때문에 필요한 캐스팅이다. 실제 모양은 Task 4·5의 단위 테스트가 검증한다.

- [ ] **Step 3: 빌드 통과 확인**

Run: `npm run build`
Expected: 성공. `/api/notion` 라우트가 빌드 출력에 나타난다.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/notion/route.ts
git commit -m "$(cat <<'MSG'
feat(notion): /api/notion 저장 라우트 추가

데이터베이스 → 데이터 소스 해석 후 속성 스키마를 읽어 페이지를
생성하고, 100블록 단위로 트랜스크립트를 append 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Notion 자격 증명 저장소 + 설정 UI

**Files:**
- Modify: `src/lib/apiKey.ts`
- Modify: `src/components/Layout/ApiKeyModal.tsx`
- Create: `src/lib/notionId.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `getNotionToken()`, `setNotionToken()`, `getNotionDbId()`, `setNotionDbId()`, `hasNotionConfig()`, `notionKeyHeaders()`, `extractDatabaseId()` — Task 8의 클라이언트가 사용한다.

`extractDatabaseId`는 순수 함수라 테스트를 쓴다. 나머지 getter/setter는 기존 `apiKey.ts` 패턴과 동일하며 테스트하지 않는다(기존 키들도 테스트가 없다).

- [ ] **Step 1: `extractDatabaseId` 실패하는 테스트 작성**

`src/lib/notionId.test.ts` 생성:

```ts
import { describe, it, expect } from "vitest";
import { extractDatabaseId } from "./apiKey";

describe("extractDatabaseId", () => {
  it("32자 hex를 그대로 반환한다", () => {
    const id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(extractDatabaseId(id)).toBe(id);
  });

  it("하이픈이 든 UUID에서 하이픈을 제거한다", () => {
    expect(extractDatabaseId("a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90")).toBe(
      "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    );
  });

  it("Notion URL에서 데이터베이스 ID를 뽑는다", () => {
    expect(
      extractDatabaseId("https://www.notion.so/myspace/a1b2c3d4e5f60718293a4b5c6d7e8f90?v=abc"),
    ).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
  });

  it("제목이 앞에 붙은 Notion URL에서도 뽑는다", () => {
    expect(
      extractDatabaseId("https://www.notion.so/회의록-a1b2c3d4e5f60718293a4b5c6d7e8f90"),
    ).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(extractDatabaseId("  a1b2c3d4e5f60718293a4b5c6d7e8f90  ")).toBe(
      "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    );
  });

  it("ID를 찾을 수 없으면 빈 문자열을 반환한다", () => {
    expect(extractDatabaseId("그냥 텍스트")).toBe("");
    expect(extractDatabaseId("")).toBe("");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionId.test.ts`
Expected: FAIL — `extractDatabaseId is not a function`

- [ ] **Step 3: `apiKey.ts`에 Notion 지원 추가**

`src/lib/apiKey.ts` **맨 위 상수 블록**에 추가:

```ts
const NOTION_TOKEN_KEY = "autonote_notion_token";
const NOTION_DB_KEY = "autonote_notion_db";
```

그리고 `clovaKeyHeaders()` 함수 **바로 아래**에 추가:

```ts
// ── Notion ──────────────────────────────────────────────────────

/**
 * 붙여넣은 값에서 32자 hex 데이터베이스 ID를 뽑는다.
 * Notion URL, 하이픈이 든 UUID, 순수 ID를 모두 받아들인다. 못 찾으면 빈 문자열.
 */
export function extractDatabaseId(input: string): string {
  const compact = input.trim().replace(/-/g, "");
  const match = compact.match(/[0-9a-fA-F]{32}/);
  return match ? match[0] : "";
}

export function getNotionToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NOTION_TOKEN_KEY) ?? "";
}

export function setNotionToken(token: string) {
  if (token.trim()) {
    localStorage.setItem(NOTION_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(NOTION_TOKEN_KEY);
  }
}

export function getNotionDbId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NOTION_DB_KEY) ?? "";
}

/** 입력값에서 ID를 추출해 저장한다. 추출에 실패하면 저장하지 않고 기존 값을 지운다. */
export function setNotionDbId(input: string) {
  const id = extractDatabaseId(input);
  if (id) {
    localStorage.setItem(NOTION_DB_KEY, id);
  } else {
    localStorage.removeItem(NOTION_DB_KEY);
  }
}

export function hasNotionConfig(): boolean {
  return getNotionToken().length > 0 && getNotionDbId().length > 0;
}

export function notionKeyHeaders(): Record<string, string> {
  return {
    "x-notion-token": getNotionToken(),
    "x-notion-db": getNotionDbId(),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionId.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 설정 모달에 Notion 섹션 추가**

`src/components/Layout/ApiKeyModal.tsx`를 수정한다.

(a) import 블록(`@/lib/apiKey`에서 가져오는 목록)에 추가:

```ts
  getNotionToken, setNotionToken,
  getNotionDbId, setNotionDbId,
```

(b) `const [geminiTokens, setGeminiTokens] = useState(...)` 아래에 상태 추가:

```ts
  const [notionToken, setNotionTokenState] = useState(getNotionToken());
  const [notionDbId, setNotionDbIdState] = useState(getNotionDbId());
```

(c) `handleSave()` 안의 `setGeminiPayAsYouGo(geminiPayAsYouGo);` 아래에 추가:

```ts
    setNotionToken(notionToken);
    setNotionDbId(notionDbId);
```

(d) `{/* 요금 통계 대시보드 */}` 블록 **바로 앞**에 Notion 섹션을 삽입:

```tsx
        {/* Notion 연동 */}
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
                value={notionToken}
                onChange={(e) => setNotionTokenState(e.target.value)}
                placeholder="ntn_..."
                style={{
                  width: "100%", padding: "9px 12px", fontSize: 13,
                  border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
                  background: "var(--surface)", color: "var(--ink)", outline: "none",
                  fontFamily: "var(--font-mono)", boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>
                데이터베이스 ID 또는 URL
              </div>
              <input
                type="text"
                value={notionDbId}
                onChange={(e) => setNotionDbIdState(e.target.value)}
                placeholder="https://notion.so/... 또는 32자 ID"
                style={{
                  width: "100%", padding: "9px 12px", fontSize: 13,
                  border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
                  background: "var(--surface)", color: "var(--ink)", outline: "none",
                  fontFamily: "var(--font-mono)", boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div style={{
            fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6,
            background: "var(--surface-2)", borderRadius: "var(--r-sm)",
            padding: "8px 10px", marginTop: 10,
          }}>
            회의가 끝나면 AI 분석 없이 이 데이터베이스에 바로 저장됩니다.
            Notion에서 <strong>통합(Integration)을 해당 데이터베이스에 초대</strong>해야 합니다.
            속성 이름을 <code>회의일시</code>(날짜) · <code>참석자</code>(텍스트) ·{" "}
            <code>소요시간</code>(텍스트) · <code>상태</code>(선택) · <code>입력방식</code>(선택)으로
            만들면 함께 채워지며, 없는 속성은 건너뜁니다.
          </div>
        </div>
```

- [ ] **Step 6: 타입 체크와 빌드 통과 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음

- [ ] **Step 7: 수동 확인**

Run: `npm run dev`
Expected: 설정(⚙️) 모달을 열면 "Notion 연동" 섹션이 요금 대시보드 위에 보인다. Notion URL을 붙여넣고 저장한 뒤 모달을 다시 열면 32자 ID만 남아 있다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/apiKey.ts src/lib/notionId.test.ts src/components/Layout/ApiKeyModal.tsx
git commit -m "$(cat <<'MSG'
feat(notion): Notion 토큰/DB ID 저장소와 설정 UI 추가

붙여넣은 Notion URL에서 32자 데이터베이스 ID를 자동 추출한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: 노트 → 페이로드 변환과 Notion 전송

**Files:**
- Create: `src/lib/notionSave.ts`
- Create: `src/lib/notionSave.test.ts`

**Interfaces:**
- Consumes: `NoteRecord` (기존), `NotionMeetingPayload` / `NotionSaveState` / `NotionSaveResponse` (Task 1), `hasNotionConfig` / `notionKeyHeaders` (Task 7)
- Produces: `noteToNotionPayload(note: NoteRecord): NotionMeetingPayload`, `pushToNotion(note: NoteRecord): Promise<NotionSaveState>` — Task 10의 `page.tsx`가 사용한다.

**화자 이름 해석 우선순위:** `note.speakerMapping[String(sp)]` → `note.participants.find(p => p.sp === sp)?.name` → `"화자 {sp}"`

**날짜:** `note.meetingDate`가 있으면 그대로 쓰되, Notion `date` 속성은 ISO 날짜여야 하므로 `YYYY-MM-DD` 형태가 아니면 `note.createdAt`에서 만든다.

- [ ] **Step 1: `noteToNotionPayload` 실패하는 테스트 작성**

`src/lib/notionSave.test.ts` 생성:

```ts
import { describe, it, expect } from "vitest";
import { noteToNotionPayload } from "./notionSave";
import type { NoteRecord } from "@/types/meeting";

const baseNote: NoteRecord = {
  id: "n1",
  title: "주간 회의",
  createdAt: new Date("2026-09-15T14:30:00").getTime(),
  entryMethod: "live",
  segments: [],
  speakerMapping: {},
  participants: [],
  audioDuration: 0,
  keywords: [],
  memo: "",
  summaryBullets: [],
  actions: [],
  decisions: [],
  questions: [],
  nextAgenda: [],
  context: "",
};

describe("noteToNotionPayload", () => {
  it("createdAt에서 YYYY-MM-DD 날짜를 만든다", () => {
    expect(noteToNotionPayload(baseNote).meetingDate).toBe("2026-09-15");
  });

  it("meetingDate가 ISO 날짜면 그대로 쓴다", () => {
    const p = noteToNotionPayload({ ...baseNote, meetingDate: "2026-08-01" });
    expect(p.meetingDate).toBe("2026-08-01");
  });

  it("meetingDate가 ISO 날짜가 아니면 createdAt으로 대체한다", () => {
    const p = noteToNotionPayload({ ...baseNote, meetingDate: "2026년 8월 1일 오후 2시" });
    expect(p.meetingDate).toBe("2026-09-15");
  });

  it("speakerMapping을 최우선으로 화자 이름을 해석한다", () => {
    const p = noteToNotionPayload({
      ...baseNote,
      speakerMapping: { "1": "김팀장" },
      participants: [{ sp: 1, name: "무시됨", role: "", initials: "" }],
      segments: [{ id: 0, sp: 1, t: "00:12", text: "안녕" }],
    });
    expect(p.turns[0].speaker).toBe("김팀장");
  });

  it("매핑이 없으면 participants의 이름을 쓴다", () => {
    const p = noteToNotionPayload({
      ...baseNote,
      participants: [{ sp: 2, name: "이책임", role: "", initials: "" }],
      segments: [{ id: 0, sp: 2, t: "", text: "네" }],
    });
    expect(p.turns[0].speaker).toBe("이책임");
  });

  it("둘 다 없으면 '화자 N'으로 적는다", () => {
    const p = noteToNotionPayload({
      ...baseNote,
      segments: [{ id: 0, sp: 3, t: "", text: "네" }],
    });
    expect(p.turns[0].speaker).toBe("화자 3");
  });

  it("participants가 있으면 attendees를 그 이름들로 채운다", () => {
    const p = noteToNotionPayload({
      ...baseNote,
      participants: [
        { sp: 1, name: "김팀장", role: "", initials: "" },
        { sp: 2, name: "", role: "", initials: "" },
      ],
    });
    expect(p.attendees).toEqual(["김팀장", "화자 2"]);
  });

  it("participants가 없으면 attendees 자유 텍스트를 쉼표로 나눈다", () => {
    const p = noteToNotionPayload({ ...baseNote, attendees: "김팀장, 이책임" });
    expect(p.attendees).toEqual(["김팀장", "이책임"]);
  });

  it("audioDuration(ms)을 소요시간 문자열로 만든다", () => {
    expect(noteToNotionPayload({ ...baseNote, audioDuration: 5025000 }).durationText).toBe("1:23:45");
    expect(noteToNotionPayload({ ...baseNote, audioDuration: 125000 }).durationText).toBe("2:05");
    expect(noteToNotionPayload({ ...baseNote, audioDuration: 0 }).durationText).toBe("");
  });

  it("제목이 비었거나 '새 노트'면 날짜·시각으로 자동 생성한다", () => {
    expect(noteToNotionPayload({ ...baseNote, title: "새 노트" }).title).toBe("2026-09-15 14:30 회의");
    expect(noteToNotionPayload({ ...baseNote, title: "  " }).title).toBe("2026-09-15 14:30 회의");
    expect(noteToNotionPayload(baseNote).title).toBe("주간 회의");
  });

  it("entryMethod가 없으면 live로 본다", () => {
    const { entryMethod, ...rest } = baseNote;
    void entryMethod;
    expect(noteToNotionPayload(rest as NoteRecord).entryMethod).toBe("live");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/notionSave.test.ts`
Expected: FAIL — `Failed to resolve import "./notionSave"`

- [ ] **Step 3: 최소 구현 작성**

`src/lib/notionSave.ts` 생성:

```ts
import type {
  NoteRecord,
  NotionMeetingPayload,
  NotionSaveResponse,
  NotionSaveState,
  NotionTurn,
} from "@/types/meeting";
import { hasNotionConfig, notionKeyHeaders } from "@/lib/apiKey";

/** ms → "1:23:45" 또는 "2:05". 0이면 빈 문자열. */
function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → "2026-09-15" (로컬 시간 기준) */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date → "2026-09-15 14:30 회의" */
function autoTitle(d: Date): string {
  return `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())} 회의`;
}

/** 화자 번호 → 표시 이름. 매핑 > 참석자 명단 > "화자 N" */
function speakerName(note: NoteRecord, sp: number): string {
  const mapped = note.speakerMapping?.[String(sp)];
  if (mapped) return mapped;
  const found = note.participants?.find((p) => p.sp === sp)?.name;
  if (found) return found;
  return `화자 ${sp}`;
}

/** NoteRecord를 /api/notion 페이로드로 변환한다. audioBlob 등 직렬화 불가 필드는 버린다. */
export function noteToNotionPayload(note: NoteRecord): NotionMeetingPayload {
  const created = new Date(note.createdAt);

  const meetingDate = /^\d{4}-\d{2}-\d{2}$/.test(note.meetingDate ?? "")
    ? note.meetingDate!
    : isoDate(created);

  const title = note.title?.trim() && note.title.trim() !== "새 노트"
    ? note.title.trim()
    : autoTitle(created);

  const attendees =
    note.participants && note.participants.length > 0
      ? note.participants.map((p) => p.name?.trim() || `화자 ${p.sp}`)
      : (note.attendees ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  const turns: NotionTurn[] = (note.segments ?? []).map((seg) => ({
    speaker: speakerName(note, seg.sp),
    time: seg.t ?? "",
    text: seg.text,
  }));

  return {
    title,
    meetingDate,
    location: note.location ?? "",
    attendees,
    durationText: formatDuration(note.audioDuration),
    entryMethod: note.entryMethod ?? "live",
    turns,
  };
}

/**
 * 노트를 Notion에 저장하고 표시용 상태를 돌려준다. 예외를 던지지 않는다 —
 * 호출자는 이 결과를 배너에 그대로 쓰면 된다.
 */
export async function pushToNotion(note: NoteRecord): Promise<NotionSaveState> {
  if (!hasNotionConfig()) return { kind: "unconfigured" };

  try {
    const res = await fetch("/api/notion", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...notionKeyHeaders() },
      body: JSON.stringify(noteToNotionPayload(note)),
    });

    const data = (await res.json()) as NotionSaveResponse;

    if (data.ok) {
      return { kind: "saved", skippedProperties: data.skippedProperties };
    }
    if (data.stage === "append") {
      return { kind: "partial", savedBlocks: data.savedBlocks, totalBlocks: data.totalBlocks };
    }
    return { kind: "failed", message: data.error };
  } catch (err) {
    return {
      kind: "failed",
      message: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
    };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/notionSave.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/notionSave.ts src/lib/notionSave.test.ts
git commit -m "$(cat <<'MSG'
feat(notion): NoteRecord → Notion 페이로드 변환과 전송 함수 추가

화자 이름은 매핑 > 참석자 명단 > "화자 N" 순으로 해석하고,
제목이 비었거나 "새 노트"면 날짜·시각으로 자동 생성한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: `audioDuration` 채우기와 단위 정리

**Files:**
- Modify: `src/lib/audioChunk.ts:26-45`
- Modify: `src/components/Layout/ApiKeyModal.tsx:120-124`
- Modify: `src/app/page.tsx` (`handleAudioSubmit` 안 `chunkAudioFile` 호출 2곳)

**Interfaces:**
- Consumes: 없음
- Produces: `chunkAudioFile(file, chunkDurationS?): Promise<{ chunks: Blob[]; durationMs: number }>` — Task 10이 `durationMs`를 `audioDuration`에 넣는다.

**배경:** `NoteRecord.audioDuration`은 `emptyNote()`에서 0으로 초기화된 뒤 어디서도 갱신되지 않는다. 그런데 `NoteList`·`ModeSelect`는 이 값을 **ms**로, `ApiKeyModal`은 **초**로 읽는다. 단위를 **ms로 확정**하고(소비처 2곳과 `elapsedMs`에 맞춤) `ApiKeyModal`을 고친다.

- [ ] **Step 1: `chunkAudioFile`이 실제 길이를 함께 반환하도록 변경**

`src/lib/audioChunk.ts`의 `chunkAudioFile`을 아래로 교체한다:

```ts
export async function chunkAudioFile(
  file: File,
  chunkDurationS = CHUNK_DURATION_S,
): Promise<{ chunks: Blob[]; durationMs: number }> {
  const arrayBuf = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const audio = await ctx.decodeAudioData(arrayBuf);
  await ctx.close();

  const pcm = audio.getChannelData(0); // mono
  const chunkLen = chunkDurationS * SAMPLE_RATE;
  const chunks: Blob[] = [];

  for (let start = 0; start < pcm.length; start += chunkLen) {
    const slice = pcm.slice(start, Math.min(start + chunkLen, pcm.length));
    chunks.push(new Blob([encodeWav(slice, SAMPLE_RATE)], { type: "audio/wav" }));
  }

  return { chunks, durationMs: Math.round(audio.duration * 1000) };
}
```

- [ ] **Step 2: 호출처 2곳 수정**

`src/app/page.tsx`의 `handleAudioSubmit` 안에서 `chunkAudioFile`을 부르는 곳이 두 군데다 (Clova 분기와 Gemini/OpenAI 분기).

먼저 `const texts: string[] = [];` 줄 **위에** 길이를 담을 변수를 선언한다:

```ts
      let audioDurationMs = 0;
```

그리고 Clova 분기의

```ts
        const chunks = await chunkAudioFile(file, 120);
```

를

```ts
        const { chunks, durationMs } = await chunkAudioFile(file, 120);
        audioDurationMs = durationMs;
```

로 바꾼다. Gemini/OpenAI 분기의 같은 줄도 **동일하게** 바꾼다.

- [ ] **Step 3: `ApiKeyModal`의 단위 버그 수정**

`src/components/Layout/ApiKeyModal.tsx`의 요금 계산 블록에서

```ts
  const totalAudioDurationSec = notes
    ? notes.reduce((acc, note) => acc + (note.audioDuration || 0), 0)
    : 0;
```

를 아래로 바꾼다 (`audioDuration`은 ms이므로 1000으로 나눈다):

```ts
  // audioDuration은 밀리초 단위로 저장된다.
  const totalAudioDurationSec = notes
    ? Math.floor(notes.reduce((acc, note) => acc + (note.audioDuration || 0), 0) / 1000)
    : 0;
```

- [ ] **Step 4: 타입 체크와 빌드 통과 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음. `chunkAudioFile`의 반환 타입이 바뀌었으므로 고치지 않은 호출처가 있으면 여기서 잡힌다.

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/audioChunk.ts src/app/page.tsx src/components/Layout/ApiKeyModal.tsx
git commit -m "$(cat <<'MSG'
fix: audioDuration 단위를 ms로 통일하고 실제 오디오 길이를 채움

chunkAudioFile이 디코딩한 오디오의 실제 길이를 함께 반환한다.
ApiKeyModal이 이 값을 초로 오해해 Clova 요금을 1000배로 계산하던
잠재 버그도 함께 고친다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: 자동 분석 제거 + Notion 저장 연결

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `pushToNotion` (Task 8), `NotionSaveState` (Task 1), `chunkAudioFile`의 새 반환 타입 (Task 9)
- Produces: `notionStatus` / `handleRetryNotion` — Task 11의 `AppShell`이 props로 받는다.

**핵심:** `callAnalyze`, `applyAnalysis`, `handleRegen`은 **그대로 둔다.** 세 입력 경로에서 `callAnalyze` **호출만** 제거하고 `finalizeNote()`로 대체한다.

- [ ] **Step 1: import와 상태 추가**

`src/app/page.tsx` 상단 import 블록에 추가:

```ts
import { pushToNotion } from "@/lib/notionSave";
```

`import type { ... } from "@/types/meeting";` 목록에 `NotionSaveState`를 추가한다.

`const [analyzing, setAnalyzing] = useState(false);` 아래에 상태와 재시도용 ref를 추가:

```ts
  const [notionStatus, setNotionStatus] = useState<NotionSaveState>({ kind: "idle" });
  const lastSavedNote = useRef<NoteRecord | null>(null);
```

- [ ] **Step 2: `finalizeNote` 추가**

기존 `saveNote` 함수 **바로 아래**에 추가:

```ts
  /**
   * 입력이 끝난 노트를 확정 저장한다. 로컬(IndexedDB + 폴더)을 먼저 저장하고
   * 그다음 Notion으로 보낸다. Notion이 실패해도 회의 내용은 로컬에 남는다.
   */
  async function finalizeNote(note: NoteRecord) {
    saveNote(note);
    lastSavedNote.current = note;
    setNotionStatus({ kind: "saving" });
    setNotionStatus(await pushToNotion(note));
  }

  async function handleRetryNotion() {
    const note = lastSavedNote.current;
    if (!note) return;
    setNotionStatus({ kind: "saving" });
    setNotionStatus(await pushToNotion(note));
  }
```

- [ ] **Step 3: live 녹음 중지 경로에서 자동 분석 제거**

`handleToggleRecording`의 녹음 중지 분기를 아래로 교체한다:

```ts
  async function handleToggleRecording() {
    if (stt.isRecording) {
      const elapsedMs = stt.elapsedMs;
      await stt.stopRecording();
      setAppMode("review");
      if (currentNote) {
        // AI 분석은 하지 않는다. 사용자가 "다시 정리"를 누를 때만 실행된다.
        const turns = stt.getLatestTurns();
        await finalizeNote({
          ...currentNote,
          participants: stt.participants,
          segments: turns,
          audioDuration: elapsedMs,
        });
      }
    } else {
      stt.startRecording().catch(console.error);
      setAppMode("live");
    }
  }
```

> `stt.elapsedMs`를 `stopRecording()` **전에** 읽는 이유: 중지 후에는 타이머가 멈추거나 초기화될 수 있다.

- [ ] **Step 4: 텍스트 입력 경로에서 자동 분석 제거**

`handleTextSubmit`을 아래로 교체한다:

```ts
  async function handleTextSubmit(data: TextSubmitData) {
    const note = currentNote ?? emptyNote("text");
    if (!currentNote) setCurrentNote(note);

    // AI 분석 없이 바로 저장한다. 분석은 "다시 정리" 버튼에서만 실행된다.
    const textTurns = parseTextToTurns(data.text);
    await finalizeNote({
      ...note,
      segments: textTurns,
      title: data.title || note.title,
      meetingDate: data.date || note.meetingDate,
    });
    setAppMode("review");
    setScreen("live");
  }
```

> `analyzing` 상태는 이 경로에서 더 이상 쓰지 않는다. `TextInputPanel`의 `loading={analyzing}` prop은 그대로 두면 항상 false가 되어 정상 동작한다.

- [ ] **Step 5: 오디오 파일 경로에서 자동 분석 제거**

`handleAudioSubmit`에서 STT 루프가 끝난 뒤의 아래 블록을

```ts
      const transcript = texts.join("\n");
      const result = await callAnalyze(transcript, {
        title: file.name.replace(/\.[^.]+$/, ""),
        date: new Date().toLocaleDateString("ko-KR"),
        attendees: "미정",
      });
      const updated = applyAnalysis({ ...note, segments: allTurns, title: file.name.replace(/\.[^.]+$/, "") }, result);
      saveNote(updated);
      setAppMode("review");
      setScreen("live");
```

아래로 교체한다:

```ts
      // AI 분석 없이 바로 저장한다. 분석은 "다시 정리" 버튼에서만 실행된다.
      await finalizeNote({
        ...note,
        segments: allTurns,
        title: file.name.replace(/\.[^.]+$/, ""),
        audioDuration: audioDurationMs,
      });
      setAppMode("review");
      setScreen("live");
```

`const texts: string[] = [];`와 이후의 `texts.push(...)` 호출은 그대로 둔다 — 제거하면 린트가 미사용 변수를 잡지 않지만, 다음 스텝에서 확인한다.

- [ ] **Step 6: 미사용 변수 정리**

Run: `npx eslint src/app/page.tsx`

`texts` 변수가 더 이상 읽히지 않으므로 경고가 뜨면, `const texts: string[] = [];` 선언과 두 분기의 `if (chunkText) texts.push(chunkText);` 두 줄을 제거한다. `console.log`로 청크 내용을 찍는 줄은 그대로 둔다(디버깅에 계속 쓰인다).

Expected: eslint 통과

- [ ] **Step 7: 타입 체크와 빌드 통과 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'MSG'
feat: 회의 입력 종료 시 AI 분석 대신 Notion 직접 저장

live/텍스트/오디오 세 경로에서 자동 Gemini 분석 호출을 제거하고
finalizeNote()로 대체한다. 로컬 저장 후 Notion으로 보내므로
Notion이 실패해도 회의 내용은 남는다. 분석은 "다시 정리" 버튼에서만
실행된다.

녹음 중지 즉시 IndexedDB에 저장되면서, 저장 버튼을 누르지 않고
창을 닫으면 회의가 사라지던 기존 문제도 함께 해소된다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 11: 저장 상태 배너

**Files:**
- Modify: `src/components/Layout/AppShell.tsx:33-39` (props), `:156-167` (review-banner)
- Modify: `src/app/page.tsx` (AppShell에 props 전달)

**Interfaces:**
- Consumes: `notionStatus` / `handleRetryNotion` (Task 10), `NotionSaveState` (Task 1)
- Produces: 없음 (마지막 UI 작업)

- [ ] **Step 1: `AppShell` props 추가**

`src/components/Layout/AppShell.tsx`의 import에 타입을 추가한다:

```ts
import type { NoteRecord, Participant, TurnSegment, NotionSaveState } from "@/types/meeting";
```

`AppShellProps` 인터페이스의 `onPickFolder?: () => void;` 아래에 추가:

```ts
  notionStatus?: NotionSaveState;
  onRetryNotion?: () => void;
```

구조 분해 목록(`onPickFolder,` 아래)에도 추가:

```ts
  notionStatus = { kind: "idle" },
  onRetryNotion,
```

- [ ] **Step 2: 배너 문구 계산 함수 추가**

`export default function AppShell(` **위에** 추가:

```ts
/** 저장 상태를 배너 문구와 아이콘으로 옮긴다. */
function bannerText(status: NotionSaveState): { ico: string; text: React.ReactNode } {
  switch (status.kind) {
    case "saving":
      return { ico: "⏳", text: <span><b>저장 중…</b> Notion에 기록하고 있습니다.</span> };
    case "saved":
      return {
        ico: "✅",
        text: status.skippedProperties.length > 0
          ? <span><b>저장 완료</b> · Notion에 기록됨 (건너뛴 속성: {status.skippedProperties.join(", ")})</span>
          : <span><b>저장 완료</b> · Notion에 기록됨</span>,
      };
    case "partial":
      return {
        ico: "⚠️",
        text: <span><b>일부만 저장됨</b> ({status.savedBlocks}/{status.totalBlocks} 블록) · 다시 시도하면 새 페이지가 만들어집니다.</span>,
      };
    case "unconfigured":
      return { ico: "💾", text: <span><b>로컬에 저장됨</b> · Notion 미설정</span> };
    case "failed":
      return { ico: "❌", text: <span><b>Notion 저장 실패</b> · 로컬에는 저장됨 — {status.message}</span> };
    default:
      return { ico: "⏺", text: <span><b>녹음이 종료되었습니다.</b></span> };
  }
}
```

- [ ] **Step 3: `review-banner` 교체**

기존 블록

```tsx
        {mode === "review" && (
          <div className="review-banner" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
            <span className="ico">⏺</span>
            <span><b>녹음이 종료되었습니다.</b> 저장하려면 저장 버튼을 눌러주세요.</span>
            <div className="actions">
              <button className="btn" onClick={onToggleRecording}>이어 녹음</button>
              <button className="btn" onClick={onExport}>내보내기</button>
              <button className="btn btn-primary" onClick={onSave}>저장</button>
            </div>
          </div>
        )}
```

를 아래로 교체한다:

```tsx
        {mode === "review" && (() => {
          const { ico, text } = bannerText(notionStatus);
          const canRetry = notionStatus.kind === "failed" || notionStatus.kind === "partial";
          return (
            <div className="review-banner" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
              <span className="ico">{ico}</span>
              {text}
              <div className="actions">
                <button className="btn" onClick={onToggleRecording}>이어 녹음</button>
                {canRetry && (
                  <button className="btn" onClick={onRetryNotion}>다시 시도</button>
                )}
                {notionStatus.kind === "unconfigured" && (
                  <button className="btn" onClick={onSettings}>설정</button>
                )}
                <button className="btn" onClick={onExport}>내보내기</button>
                <button className="btn btn-primary" onClick={onSave}>저장</button>
              </div>
            </div>
          );
        })()}
```

> `저장` 버튼은 남긴다. 회의 후 화자명·메모를 고친 뒤 **로컬만** 다시 저장하는 용도다. Claude가 이미 편집했을 수 있는 Notion 페이지를 덮어쓰지 않도록, 이 버튼은 Notion을 건드리지 않는다.

- [ ] **Step 4: `page.tsx`에서 props 전달**

`src/app/page.tsx`의 `<AppShell ... />`에서 `onPickFolder={handlePickFolder}` 아래에 추가:

```tsx
        notionStatus={notionStatus}
        onRetryNotion={handleRetryNotion}
```

- [ ] **Step 5: 타입 체크와 빌드 통과 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음

- [ ] **Step 6: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/components/Layout/AppShell.tsx src/app/page.tsx
git commit -m "$(cat <<'MSG'
feat(ui): review 배너를 Notion 저장 상태 기반으로 전환

저장 중/완료/부분 저장/미설정/실패를 구분해 보여주고, 실패와
부분 저장에는 다시 시도 버튼을, 미설정에는 설정 버튼을 붙인다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 12: 수동 검증과 문서 갱신

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1~11 전부
- Produces: 없음

- [ ] **Step 1: Notion 데이터베이스 준비**

Notion에서 데이터베이스를 새로 만들고 아래 속성을 추가한다:

| 속성 이름 | 타입 |
|-----------|------|
| 회의일시 | 날짜 |
| 참석자 | 텍스트 |
| 소요시간 | 텍스트 |
| 상태 | 선택 |
| 입력방식 | 선택 |

그다음 데이터베이스 우측 상단 `⋯` → `연결` 에서 통합(Integration)을 초대한다. 이 단계를 빠뜨리면 404가 난다.

- [ ] **Step 2: 개발 서버에서 정상 경로 확인**

Run: `npm run dev`

확인 순서:
1. 설정(⚙️)에서 Notion 토큰과 데이터베이스 URL 입력 → 저장
2. live 모드로 2분 녹음 → 중지
3. 배너가 `저장 중…` → `저장 완료 · Notion에 기록됨`으로 바뀐다
4. Notion 데이터베이스에 페이지가 생기고, 속성 5개가 채워져 있으며 `상태`가 `분석대기`다
5. 페이지 본문에 `회의 정보`와 `트랜스크립트` 헤딩이 있고 발화가 전부 들어 있다

- [ ] **Step 3: 실패 경로 확인**

1. 설정에서 토큰을 일부러 틀리게 입력 → 녹음 → 중지
2. 배너가 `Notion 저장 실패 · 로컬에는 저장됨`이고 `다시 시도` 버튼이 보인다
3. 왼쪽 노트 목록에 회의가 **남아 있는지** 확인 (로컬 저장 성공)
4. 토큰을 고치고 `다시 시도` → `저장 완료`로 바뀐다

- [ ] **Step 4: 스키마 방어 확인**

1. Notion에서 `상태` 속성을 삭제
2. 녹음 → 중지
3. 배너에 `저장 완료 · Notion에 기록됨 (건너뛴 속성: 상태)`가 뜨고 저장은 성공한다

- [ ] **Step 5: 100블록 초과 확인**

발화가 100개를 넘는 회의(대략 10분 이상 대화)를 녹음하거나, 긴 텍스트를 텍스트 입력 모드로 제출한다.
Expected: 트랜스크립트가 잘리지 않고 전부 Notion 페이지에 들어간다.

- [ ] **Step 6: 수동 분석이 살아 있는지 확인**

review 화면에서 `다시 정리` 버튼을 누른다.
Expected: 기존과 동일하게 Gemini 분석이 돌고 요약·결정사항·실행과제가 채워진다. Notion 페이지는 **변경되지 않는다**.

- [ ] **Step 7: README 갱신**

`README.md`의 `### 2. API 자격 증명 설정 (필수)` 절에서 Notion 항목 설명을 아래로 교체한다:

```markdown
- **Notion Integration**: `Internal Integration Token` 및 `Database ID`
  - 회의가 끝나면 AI 분석 없이 트랜스크립트가 이 데이터베이스에 바로 저장됩니다.
  - 통합(Integration)을 해당 데이터베이스에 **초대**해야 합니다.
  - 선택 속성: `회의일시`(날짜) · `참석자`(텍스트) · `소요시간`(텍스트) · `상태`(선택) · `입력방식`(선택). 없는 속성은 건너뜁니다.
```

그리고 `### 🧠 2. 고품질 AI 분석 및 일관성` 절 첫 줄 앞에 한 줄을 추가한다:

```markdown
- **분석은 선택**: 회의 종료 시에는 분석하지 않고 Notion에 바로 저장합니다. 분석이 필요하면 결과 화면의 **다시 정리** 버튼을 누르세요.
```

- [ ] **Step 8: 커밋**

```bash
git add README.md
git commit -m "$(cat <<'MSG'
docs: Notion 직접 저장 흐름에 맞춰 README 갱신

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## 자체 검토 결과

**스펙 커버리지:** 스펙 §2 플로우 → Task 10, §3.1 페이로드 → Task 1·8, §3.2 응답 → Task 1·6, §3.3 상태 → Task 1·11, §4 스키마·데이터 소스 → Task 5·6, §5 본문 → Task 4, §6 에러 → Task 6·8·11, §7.1 유실 구멍 → Task 10, §7.2 audioDuration → Task 9, §7.3 제목 자동 생성 → Task 8, §8 UI → Task 11, §9 설정 → Task 7, §10 테스트 → Task 2~5·8·12. 빠진 요구사항 없음.

**타입 일관성:** `NotionSaveState`의 `saved` 변형은 스펙 §3.3에 `{ kind: "saved" }`로 적혀 있었으나, Task 11 배너가 건너뛴 속성을 보여주려면 그 값이 필요하다. 계획에서는 `{ kind: "saved"; skippedProperties: string[] }`로 정의했고 Task 1·8·11이 모두 이 모양을 쓴다.
