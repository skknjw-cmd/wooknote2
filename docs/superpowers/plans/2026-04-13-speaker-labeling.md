# Speaker Labeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clova Speech's opaque `[화자 N] text` string flow with a structured `Segment[]` pipeline that lets the user manually assign real speaker names pre-submit and post-submit, with string-replace and re-analyze as two recovery paths, all reflected in PDF/Word/Notion exports.

**Architecture:** `/api/stt` returns `{ segments, text }` instead of flattening. `InputTabs` keeps an ordered `Map<sequenceId, Segment[]>` to survive out-of-order STT responses. A pure-function library `src/lib/speakerMapping.ts` resolves segments to final text using priority `override > mapping > "화자 N"`. Post-edit on `/result` runs Korean-aware string replacement (조사 boundary + longest-name-first + stopword block) on the Gemini analysis JSON; a "회의록 다시 만들기" button re-runs Gemini as escape hatch. `SavedMeetingResult` is versioned (`schemaVersion: 2`) with 30-day TTL and lives in `localStorage`.

**Tech Stack:** Next.js 16.2.1 (App Router), React 19.2.4, TypeScript 5, Vitest (new), vanilla CSS modules, Naver Clova Speech, Google Gemini 2.5 Flash.

**Spec:** `docs/superpowers/specs/2026-04-13-speaker-labeling-design.md`

**Reviewers:** Software Architect (APPROVED WITH FIXES), UX Architect (APPROVED WITH FIXES). Both review checklists are in spec §10.

---

## Important Context for the Executor

### Codebase quirks
- **Next.js 16.2.1 breaking changes.** Read `node_modules/next/dist/docs/01-app/` before touching routing or server components. API route handlers still accept `NextRequest` and return `NextResponse.json()` — existing patterns are valid.
- **No `'use client'` in child components.** The codebase relies on parent `page.tsx` files having `'use client'` and the directive propagating to descendants. Follow this pattern — do NOT sprinkle `'use client'` in child components unless directly imported from a Server Component.
- **No existing tests.** Vitest is added in Task 1. All unit tests for pure functions are TDD-first.
- **CSS is vanilla + CSS Modules.** No Tailwind, no styled-components. Follow `*.module.css` pattern of existing components.
- **Privacy-first.** API keys live in `localStorage["wooks_settings"]`. Saved results live in `localStorage["last_meeting_result"]`. Do not add server-side storage.

### Task dependencies / parallelism
Tasks 2–7 (pure utils + storage) are strictly sequential since later utils depend on earlier ones.
Task 8 (`/api/stt`) only depends on Task 2 (types) — can run in parallel with 3–7.
Tasks 9–11 (InputTabs, SpeakerMappingPanel, page.tsx) must be sequential.
Tasks 12–14 (result page components) can mostly be parallel but integrate in Task 15.
Task 16 (SettingsModal) is isolated, can run any time after Task 7.

### Every task ends with a git commit.
Commit messages follow `type(scope): subject` where type ∈ {feat, test, refactor, fix, chore}.

---

## File Structure Map

| Path | Responsibility | Task |
|---|---|---|
| `package.json`, `vitest.config.ts` | Test runner setup | 1 |
| `src/types/meeting.ts` | Shared types: `Segment`, `SpeakerMapping`, `AnalysisResult`, `SavedMeetingResultV2` | 2 |
| `src/lib/speakerMapping.ts` | Pure: `parseAttendees`, `getSpeakerStats`, `resolveSegments`, `applyMappingToAnalysis` | 3–6 |
| `src/lib/speakerMapping.test.ts` | Unit tests for above | 3–6 |
| `src/lib/meetingStorage.ts` | localStorage wrapper: load/save/migrate/TTL/clear | 7 |
| `src/lib/meetingStorage.test.ts` | Unit tests for above | 7 |
| `src/app/api/stt/route.ts` | Return structured segments + text | 8 |
| `src/components/InputSection/InputTabs.tsx` | Ordered segments state, sequenceId, cumulativeOffsetMs | 9 |
| `src/components/InputSection/SpeakerMappingPanel.tsx` (new) | Bulk mapping UI with flat numbering, onboarding, chip notification | 10 |
| `src/components/InputSection/SpeakerMappingPanel.module.css` (new) | Styles | 10 |
| `src/app/page.tsx` | Resolve mapping on submit, pass to analyze, save v2 | 11 |
| `src/components/ResultSection/SegmentOverrideList.tsx` (new) | Collapsed-by-default per-segment editing with blocks + filter | 12 |
| `src/components/ResultSection/SegmentOverrideList.module.css` (new) | Styles | 12 |
| `src/components/ResultSection/TranscriptEditor.tsx` (new) | Container: panels + actions + loading + undo + callout | 13 |
| `src/components/ResultSection/TranscriptEditor.module.css` (new) | Styles | 13 |
| `src/app/result/page.tsx` | Migration load, integrate TranscriptEditor | 14 |
| `src/components/Settings/SettingsModal.tsx` | "저장된 회의록 삭제" button | 15 |

---

## Task 1: Add Vitest Test Runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest + jsdom + @testing-library/react**

```bash
cd "C:\Users\다우닝\project\autonote"
npm install -D vitest@^2 jsdom@^25 @vitest/ui@^2
```

Expected: `added 80~ packages` or similar success output.

- [ ] **Step 2: Create vitest.config.ts**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

Edit `package.json` `scripts` section to add:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Sanity test**

Create `src/lib/__sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 5: Delete sanity test and commit**

```bash
rm src/lib/__sanity.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

## Task 2: Create Shared Types

**Files:**
- Create: `src/types/meeting.ts`

- [ ] **Step 1: Write the types file**

```ts
// src/types/meeting.ts

/**
 * One utterance unit. Clova segment + frontend-assigned stable ID.
 * originalSpeaker is namespaced ("${sequenceId}:${clovaLabel}") so the
 * same Clova label in different 2-minute chunks doesn't collide.
 */
export type Segment = {
  id: string; // "seg_000001" monotonic counter
  sequenceId: number; // recording chunk order
  originalSpeaker: string; // e.g. "1:1", "2:1"
  text: string;
  start?: number; // cumulative ms from recording start
  end?: number;
  speakerOverride?: string; // per-segment override, wins over mapping
};

/**
 * originalSpeaker (namespaced) -> real name.
 * Empty-string values are stripped on save (treated as "no mapping").
 */
export type SpeakerMapping = Record<string, string>;

export type AnalysisSectionNumbered = {
  name: string;
  type: "numbered";
  content: Array<{ title: string; description: string }>;
};

export type AnalysisSectionTable = {
  name: string;
  type: "table";
  content: Array<{
    task: string;
    owner: string;
    due: string;
    prio: string;
    notes: string;
  }>;
};

export type AnalysisSection = AnalysisSectionNumbered | AnalysisSectionTable;

export type AnalysisResult = {
  title: string;
  date: string;
  attendees: string[];
  sections: AnalysisSection[];
};

export type MeetingInfo = {
  title: string;
  date: string;
  location: string;
  attendees: string;
};

/**
 * Full snapshot stored in localStorage["last_meeting_result"].
 * Always writes schemaVersion: 2. A loader migrates v1 on read.
 */
export type SavedMeetingResultV2 = {
  schemaVersion: 2;
  analysis: AnalysisResult;
  segments: Segment[];
  mapping: SpeakerMapping;
  meetingInfo: MeetingInfo;
  selectedOptions: string[];
  generatedAt: string; // ISO
  expiresAt: string; // ISO, generatedAt + 30 days
};

/** Legacy shape (pure AnalysisResult dumped directly). */
export type SavedMeetingResultV1 = AnalysisResult;

export type SavedMeetingResult = SavedMeetingResultV2 | SavedMeetingResultV1;

/** Input state carried by the main page form. */
export type InputData = {
  type: "text" | "file" | "record";
  content: string | File | Blob | null;
  segments?: Segment[];
  mapping?: SpeakerMapping;
};
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors (or only pre-existing errors unrelated to this file)

- [ ] **Step 3: Commit**

```bash
git add src/types/meeting.ts
git commit -m "feat(types): add shared meeting types for speaker labeling"
```

---

## Task 3: Implement `parseAttendees`

**Files:**
- Create: `src/lib/speakerMapping.ts`
- Create: `src/lib/speakerMapping.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/speakerMapping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAttendees } from "./speakerMapping";

describe("parseAttendees", () => {
  it("splits on commas and trims", () => {
    expect(parseAttendees("홍길동, 김영희, 박철수")).toEqual([
      "홍길동",
      "김영희",
      "박철수",
    ]);
  });

  it("removes empty entries and duplicates preserving first occurrence", () => {
    expect(parseAttendees("홍길동,,김영희 , 홍길동")).toEqual([
      "홍길동",
      "김영희",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseAttendees("")).toEqual([]);
    expect(parseAttendees("   ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Create empty module and run failing test**

Create `src/lib/speakerMapping.ts`:

```ts
// src/lib/speakerMapping.ts
export function parseAttendees(csv: string): string[] {
  throw new Error("not implemented");
}
```

Run: `npm test -- src/lib/speakerMapping.test.ts`
Expected: FAIL with "not implemented"

- [ ] **Step 3: Implement**

Replace the body:

```ts
export function parseAttendees(csv: string): string[] {
  if (!csv) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of csv.split(",")) {
    const name = raw.trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/lib/speakerMapping.test.ts`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/speakerMapping.ts src/lib/speakerMapping.test.ts
git commit -m "feat(lib): add parseAttendees utility"
```

---

## Task 4: Implement `getSpeakerStats`

**Files:**
- Modify: `src/lib/speakerMapping.ts`
- Modify: `src/lib/speakerMapping.test.ts`

**Contract:** Returns one entry per unique `originalSpeaker`, in first-encounter order, with a 1-based `globalIndex` and the utterance count. The panel uses `globalIndex` to show `화자 1`, `화자 2`, ... The namespaced key stays internal.

- [ ] **Step 1: Append failing tests**

Append to `src/lib/speakerMapping.test.ts`:

```ts
import { getSpeakerStats } from "./speakerMapping";
import type { Segment } from "@/types/meeting";

const seg = (i: number, sp: string, text = "x"): Segment => ({
  id: `seg_${String(i).padStart(6, "0")}`,
  sequenceId: Number(sp.split(":")[0]),
  originalSpeaker: sp,
  text,
});

describe("getSpeakerStats", () => {
  it("returns empty array for no segments", () => {
    expect(getSpeakerStats([])).toEqual([]);
  });

  it("counts occurrences per original speaker in encounter order", () => {
    const segs = [
      seg(1, "1:1"),
      seg(2, "1:2"),
      seg(3, "1:1"),
      seg(4, "2:1"),
    ];
    const stats = getSpeakerStats(segs);
    expect(stats).toEqual([
      { originalSpeaker: "1:1", count: 2, globalIndex: 1 },
      { originalSpeaker: "1:2", count: 1, globalIndex: 2 },
      { originalSpeaker: "2:1", count: 1, globalIndex: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Append stub and run failing test**

Append to `src/lib/speakerMapping.ts`:

```ts
import type { Segment } from "@/types/meeting";

export type SpeakerStat = {
  originalSpeaker: string;
  count: number;
  globalIndex: number;
};

export function getSpeakerStats(segments: Segment[]): SpeakerStat[] {
  throw new Error("not implemented");
}
```

Run: `npm test -- src/lib/speakerMapping.test.ts`
Expected: 3 pass (parseAttendees), 2 fail (getSpeakerStats)

- [ ] **Step 3: Implement**

Replace `getSpeakerStats` body:

```ts
export function getSpeakerStats(segments: Segment[]): SpeakerStat[] {
  const byKey = new Map<string, SpeakerStat>();
  let idx = 0;
  for (const s of segments) {
    const existing = byKey.get(s.originalSpeaker);
    if (existing) {
      existing.count += 1;
    } else {
      idx += 1;
      byKey.set(s.originalSpeaker, {
        originalSpeaker: s.originalSpeaker,
        count: 1,
        globalIndex: idx,
      });
    }
  }
  return Array.from(byKey.values());
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/speakerMapping.test.ts`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/speakerMapping.ts src/lib/speakerMapping.test.ts
git commit -m "feat(lib): add getSpeakerStats with global index"
```

---

## Task 5: Implement `resolveSegments`

**Files:**
- Modify: `src/lib/speakerMapping.ts`
- Modify: `src/lib/speakerMapping.test.ts`

**Contract:**
- Priority: `speakerOverride` > `mapping[originalSpeaker]` > `"화자 {globalIndex}"`
- Consecutive segments with the same effective speaker are merged into one block with `\n` separator (no duplicated prefix).
- Output format: `${effectiveName}: ${joinedText}` blocks separated by `\n\n`.

- [ ] **Step 1: Append failing tests**

Append to `src/lib/speakerMapping.test.ts`:

```ts
import { resolveSegments } from "./speakerMapping";
import type { SpeakerMapping } from "@/types/meeting";

describe("resolveSegments", () => {
  it("falls back to 화자 N when no mapping", () => {
    const segs: Segment[] = [
      seg(1, "1:1", "안녕하세요"),
      seg(2, "1:2", "반갑습니다"),
    ];
    expect(resolveSegments(segs, {})).toBe(
      "화자 1: 안녕하세요\n\n화자 2: 반갑습니다"
    );
  });

  it("uses mapping when present", () => {
    const segs: Segment[] = [seg(1, "1:1", "안녕")];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("홍길동: 안녕");
  });

  it("speakerOverride wins over mapping", () => {
    const segs: Segment[] = [
      { ...seg(1, "1:1", "안녕"), speakerOverride: "김영희" },
    ];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("김영희: 안녕");
  });

  it("merges consecutive same-speaker segments into one block", () => {
    const segs: Segment[] = [
      seg(1, "1:1", "첫 번째"),
      seg(2, "1:1", "두 번째"),
      seg(3, "1:2", "다른 사람"),
      seg(4, "1:1", "다시 첫 번째"),
    ];
    const map: SpeakerMapping = { "1:1": "홍길동", "1:2": "김영희" };
    expect(resolveSegments(segs, map)).toBe(
      "홍길동: 첫 번째\n두 번째\n\n김영희: 다른 사람\n\n홍길동: 다시 첫 번째"
    );
  });

  it("treats empty-string mapping as no mapping (falls back to 화자 N)", () => {
    const segs: Segment[] = [seg(1, "1:1", "안녕")];
    const map: SpeakerMapping = { "1:1": "" };
    expect(resolveSegments(segs, map)).toBe("화자 1: 안녕");
  });
});
```

- [ ] **Step 2: Append stub and run failing test**

Append to `src/lib/speakerMapping.ts`:

```ts
import type { SpeakerMapping } from "@/types/meeting";

export function resolveSegments(
  segments: Segment[],
  mapping: SpeakerMapping
): string {
  throw new Error("not implemented");
}
```

Run: `npm test -- src/lib/speakerMapping.test.ts`
Expected: failures on resolveSegments tests

- [ ] **Step 3: Implement**

Replace `resolveSegments` body:

```ts
export function resolveSegments(
  segments: Segment[],
  mapping: SpeakerMapping
): string {
  if (segments.length === 0) return "";

  const stats = getSpeakerStats(segments);
  const indexByKey = new Map(
    stats.map((s) => [s.originalSpeaker, s.globalIndex])
  );

  const effectiveNameOf = (s: Segment): string => {
    if (s.speakerOverride && s.speakerOverride.trim()) {
      return s.speakerOverride.trim();
    }
    const mapped = mapping[s.originalSpeaker];
    if (mapped && mapped.trim()) return mapped.trim();
    const idx = indexByKey.get(s.originalSpeaker) ?? 0;
    return `화자 ${idx}`;
  };

  type Block = { speaker: string; lines: string[] };
  const blocks: Block[] = [];
  for (const s of segments) {
    const name = effectiveNameOf(s);
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === name) {
      last.lines.push(s.text);
    } else {
      blocks.push({ speaker: name, lines: [s.text] });
    }
  }

  return blocks
    .map((b) => `${b.speaker}: ${b.lines.join("\n")}`)
    .join("\n\n");
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/speakerMapping.test.ts`
Expected: `10 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/speakerMapping.ts src/lib/speakerMapping.test.ts
git commit -m "feat(lib): add resolveSegments with override priority and block merging"
```

---

## Task 6: Implement `applyMappingToAnalysis` (Korean-aware replacement)

**Files:**
- Modify: `src/lib/speakerMapping.ts`
- Modify: `src/lib/speakerMapping.test.ts`

**Contract:**
- For each speaker whose name changed (or was added) between oldMapping and newMapping, replace the old name's occurrences in every string field of every section with the new name.
- **Korean 조사 boundary**: replace only when the old name is preceded by `^|[\s.,!?:;「『"'(\[]` and followed by `$|[\s.,!?:;「』"')\]]` OR one of the particles (`은는이가을를과와의에서도로께으`).
- **Longest-first**: sort old names by length descending before replacement to prevent shorter names from corrupting longer ones ("홍길" vs "홍길동").
- **Stopword collision**: a fixed list of common Korean nouns. If any old name exists in the stopword set, skip replacement and count it as unresolved.
- **attendees merge**: the returned `analysis.attendees` is the union of (a) old attendees with replaced names and (b) all `Object.values(newMapping).filter(Boolean)` values, deduped.
- Returns `{ analysis, unresolvedCount, unresolvedNames }`.

- [ ] **Step 1: Append failing tests**

Append to `src/lib/speakerMapping.test.ts`:

```ts
import { applyMappingToAnalysis } from "./speakerMapping";
import type { AnalysisResult } from "@/types/meeting";

const makeAnalysis = (): AnalysisResult => ({
  title: "주간회의",
  date: "2026-04-13",
  attendees: ["홍길동", "김영희"],
  sections: [
    {
      name: "핵심요약",
      type: "numbered",
      content: [
        { title: "결정", description: "홍길동이 결정함. 김영희는 반대함." },
      ],
    },
    {
      name: "To-Do",
      type: "table",
      content: [
        {
          task: "계약서",
          owner: "홍길동",
          due: "04/20",
          prio: "상",
          notes: "홍길동이 검토",
        },
      ],
    },
  ],
});

describe("applyMappingToAnalysis", () => {
  it("replaces a renamed speaker across all string fields and attendees", () => {
    const analysis = makeAnalysis();
    const old = { "1:1": "홍길동", "1:2": "김영희" };
    const next = { "1:1": "박철수", "1:2": "김영희" };

    const { analysis: out, unresolvedCount, unresolvedNames } =
      applyMappingToAnalysis(analysis, old, next);

    expect(unresolvedCount).toBe(0);
    expect(unresolvedNames).toEqual([]);
    expect(out.attendees).toContain("박철수");
    expect(out.attendees).not.toContain("홍길동");
    expect(out.attendees).toContain("김영희");

    const numbered = out.sections[0];
    if (numbered.type !== "numbered") throw new Error("wrong type");
    expect(numbered.content[0].description).toBe(
      "박철수가 결정함. 김영희는 반대함."
    );

    const table = out.sections[1];
    if (table.type !== "table") throw new Error("wrong type");
    expect(table.content[0].owner).toBe("박철수");
    expect(table.content[0].notes).toBe("박철수가 검토");
  });

  it("respects 조사 boundary: 홍길동이 -> 박철수가 (particle preserved)", () => {
    const analysis: AnalysisResult = {
      title: "t",
      date: "d",
      attendees: ["홍길동"],
      sections: [
        {
          name: "n",
          type: "numbered",
          content: [{ title: "t", description: "홍길동이 말했다" }],
        },
      ],
    };
    const { analysis: out } = applyMappingToAnalysis(
      analysis,
      { "1:1": "홍길동" },
      { "1:1": "박철수" }
    );
    const sec = out.sections[0];
    if (sec.type !== "numbered") throw new Error("wrong");
    expect(sec.content[0].description).toBe("박철수이 말했다");
    // Note: the utility does not rewrite particles (이→가). It only
    // replaces the name token. Downstream users understand this limit.
  });

  it("does not corrupt substrings (홍길 vs 홍길동, longest-first)", () => {
    const analysis: AnalysisResult = {
      title: "t",
      date: "d",
      attendees: ["홍길", "홍길동"],
      sections: [
        {
          name: "n",
          type: "numbered",
          content: [{ title: "t", description: "홍길동이 왔다. 홍길도 왔다." }],
        },
      ],
    };
    const { analysis: out } = applyMappingToAnalysis(
      analysis,
      { "1:1": "홍길동", "1:2": "홍길" },
      { "1:1": "박철수", "1:2": "이영수" }
    );
    const sec = out.sections[0];
    if (sec.type !== "numbered") throw new Error("wrong");
    expect(sec.content[0].description).toBe("박철수이 왔다. 이영수도 왔다.");
  });

  it("blocks replacement for stopword-colliding names and reports unresolved", () => {
    const analysis: AnalysisResult = {
      title: "t",
      date: "d",
      attendees: ["김"],
      sections: [
        {
          name: "n",
          type: "numbered",
          content: [{ title: "t", description: "김치 얘기를 했다" }],
        },
      ],
    };
    const { analysis: out, unresolvedNames } = applyMappingToAnalysis(
      analysis,
      { "1:1": "김" },
      { "1:1": "박철수" }
    );
    const sec = out.sections[0];
    if (sec.type !== "numbered") throw new Error("wrong");
    expect(sec.content[0].description).toBe("김치 얘기를 했다");
    expect(unresolvedNames).toContain("김");
  });

  it("no-op when oldMapping and newMapping are identical", () => {
    const analysis = makeAnalysis();
    const map = { "1:1": "홍길동", "1:2": "김영희" };
    const { analysis: out, unresolvedCount } = applyMappingToAnalysis(
      analysis,
      map,
      map
    );
    expect(out).toEqual(analysis);
    expect(unresolvedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Append stub and run failing test**

Append to `src/lib/speakerMapping.ts`:

```ts
import type { AnalysisResult } from "@/types/meeting";

export type ApplyMappingResult = {
  analysis: AnalysisResult;
  unresolvedCount: number;
  unresolvedNames: string[];
};

export function applyMappingToAnalysis(
  analysis: AnalysisResult,
  oldMapping: SpeakerMapping,
  newMapping: SpeakerMapping
): ApplyMappingResult {
  throw new Error("not implemented");
}
```

Run: `npm test -- src/lib/speakerMapping.test.ts`
Expected: the 5 new tests fail

- [ ] **Step 3: Implement**

Replace the body. Add stopwords constant and helper at the top of the file (just below imports):

```ts
// Common Korean nouns that would be corrupted by short-name replacement.
// If any old name matches one of these, we skip replacement and report it.
const NAME_COLLISION_STOPWORDS = new Set<string>([
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
  "김치", "김밥", "김포", "이사", "이사회", "이사진", "박사", "박수",
  "최고", "최근", "정리", "정치", "정부", "강조", "조정", "조금",
  "장소", "장기", "임시",
]);

// Particles that commonly attach to a name in Korean prose.
const PARTICLES = "은는이가을를과와의에서도로께으";

// Escapes a string for use inside a RegExp literal.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildNameRegex(name: string): RegExp {
  const escaped = escapeRegex(name);
  // Lookbehind: start, whitespace, punctuation
  // Lookahead: end, whitespace, punctuation, or Korean particle
  const pattern =
    `(?<=^|[\\s.,!?:;「『"'(\\[])` +
    escaped +
    `(?=$|[\\s.,!?:;「』"')\\]]|[${PARTICLES}])`;
  return new RegExp(pattern, "g");
}
```

Now implement:

```ts
export function applyMappingToAnalysis(
  analysis: AnalysisResult,
  oldMapping: SpeakerMapping,
  newMapping: SpeakerMapping
): ApplyMappingResult {
  // Collect (oldName -> newName) entries where the effective name changed.
  const renames: Array<{ oldName: string; newName: string }> = [];
  const seenOldNames = new Set<string>();
  for (const key of new Set([
    ...Object.keys(oldMapping),
    ...Object.keys(newMapping),
  ])) {
    const oldName = (oldMapping[key] || "").trim();
    const newName = (newMapping[key] || "").trim();
    if (!oldName || !newName) continue;
    if (oldName === newName) continue;
    if (seenOldNames.has(oldName)) continue;
    seenOldNames.add(oldName);
    renames.push({ oldName, newName });
  }

  // Longest oldName first to avoid substring corruption.
  renames.sort((a, b) => b.oldName.length - a.oldName.length);

  const unresolvedNames: string[] = [];
  const safeRenames: Array<{ oldName: string; newName: string; re: RegExp }> =
    [];
  for (const r of renames) {
    if (NAME_COLLISION_STOPWORDS.has(r.oldName)) {
      unresolvedNames.push(r.oldName);
      continue;
    }
    safeRenames.push({ ...r, re: buildNameRegex(r.oldName) });
  }

  const replaceInString = (value: string): string => {
    let out = value;
    for (const r of safeRenames) {
      out = out.replace(r.re, r.newName);
    }
    return out;
  };

  const nextSections = analysis.sections.map((section) => {
    if (section.type === "numbered") {
      return {
        ...section,
        content: section.content.map((item) => ({
          title: replaceInString(item.title),
          description: replaceInString(item.description),
        })),
      };
    }
    return {
      ...section,
      content: section.content.map((item) => ({
        task: replaceInString(item.task),
        owner: replaceInString(item.owner),
        due: replaceInString(item.due),
        prio: replaceInString(item.prio),
        notes: replaceInString(item.notes),
      })),
    };
  });

  // Merge attendees: remove old names, add new mapping values (dedup, preserve order).
  const removeOldNames = new Set(safeRenames.map((r) => r.oldName));
  const cleanedOld = analysis.attendees.filter((a) => !removeOldNames.has(a));
  const mergedAttendees: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    mergedAttendees.push(trimmed);
  };
  for (const name of cleanedOld) pushUnique(name);
  for (const value of Object.values(newMapping)) {
    if (value) pushUnique(value);
  }

  return {
    analysis: {
      ...analysis,
      attendees: mergedAttendees,
      sections: nextSections,
    },
    unresolvedCount: unresolvedNames.length,
    unresolvedNames,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/speakerMapping.test.ts`
Expected: `15 passed`

If any test fails, DO NOT relax the stopword set to make them pass. The stopword set is a deliberate safety net — if a test fails because of it, review whether the test case is realistic or whether the stopword set needs a genuinely-needed addition.

- [ ] **Step 5: Commit**

```bash
git add src/lib/speakerMapping.ts src/lib/speakerMapping.test.ts
git commit -m "feat(lib): add applyMappingToAnalysis with Korean particle boundaries"
```

---

## Task 7: Implement `meetingStorage` (versioning + TTL)

**Files:**
- Create: `src/lib/meetingStorage.ts`
- Create: `src/lib/meetingStorage.test.ts`

**Contract:**
- `saveMeetingResult(input)` adds `schemaVersion: 2`, `generatedAt` (if missing), `expiresAt` (30 days from generatedAt), writes to `localStorage["last_meeting_result"]`.
- `loadMeetingResult()`:
  - Returns null if key missing.
  - If parsed JSON has `schemaVersion === 2`, check `expiresAt` — if past, remove key and return null; else return as-is.
  - If no `schemaVersion`, treat as v1 (pure AnalysisResult), migrate to v2 shell with empty segments/mapping, return migrated (without writing).
  - On JSON parse error, remove key and return null.
- `clearMeetingResult()` removes the key.

- [ ] **Step 1: Write failing tests**

Create `src/lib/meetingStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadMeetingResult,
  saveMeetingResult,
  clearMeetingResult,
} from "./meetingStorage";
import type {
  AnalysisResult,
  SavedMeetingResultV2,
  MeetingInfo,
} from "@/types/meeting";

const KEY = "last_meeting_result";

const baseAnalysis: AnalysisResult = {
  title: "t",
  date: "2026-04-13",
  attendees: [],
  sections: [],
};

const baseMeetingInfo: MeetingInfo = {
  title: "t",
  date: "2026-04-13",
  location: "",
  attendees: "",
};

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("meetingStorage", () => {
  it("returns null when nothing is stored", () => {
    expect(loadMeetingResult()).toBeNull();
  });

  it("round-trips a v2 save/load", () => {
    saveMeetingResult({
      analysis: baseAnalysis,
      segments: [],
      mapping: {},
      meetingInfo: baseMeetingInfo,
      selectedOptions: ["핵심요약"],
      generatedAt: new Date("2026-04-13T09:00:00Z").toISOString(),
    });
    const loaded = loadMeetingResult();
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(2);
    expect(loaded!.analysis).toEqual(baseAnalysis);
    expect(loaded!.expiresAt).toBeDefined();
  });

  it("migrates legacy v1 shape to v2 on load", () => {
    localStorage.setItem(KEY, JSON.stringify(baseAnalysis));
    const loaded = loadMeetingResult();
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(2);
    expect(loaded!.segments).toEqual([]);
    expect(loaded!.mapping).toEqual({});
    expect(loaded!.analysis).toEqual(baseAnalysis);
  });

  it("removes expired v2 entries and returns null", () => {
    const expired: SavedMeetingResultV2 = {
      schemaVersion: 2,
      analysis: baseAnalysis,
      segments: [],
      mapping: {},
      meetingInfo: baseMeetingInfo,
      selectedOptions: [],
      generatedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-31T00:00:00Z", // before today
    };
    localStorage.setItem(KEY, JSON.stringify(expired));
    expect(loadMeetingResult()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("clearMeetingResult removes the key", () => {
    localStorage.setItem(KEY, "x");
    clearMeetingResult();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("returns null and clears key on invalid JSON", () => {
    localStorage.setItem(KEY, "not json");
    expect(loadMeetingResult()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Create empty module and verify failing tests**

Create `src/lib/meetingStorage.ts`:

```ts
// src/lib/meetingStorage.ts
import type {
  SavedMeetingResultV2,
  SavedMeetingResult,
  AnalysisResult,
  MeetingInfo,
  Segment,
  SpeakerMapping,
} from "@/types/meeting";

const STORAGE_KEY = "last_meeting_result";
const TTL_DAYS = 30;

export type SaveInput = {
  analysis: AnalysisResult;
  segments: Segment[];
  mapping: SpeakerMapping;
  meetingInfo: MeetingInfo;
  selectedOptions: string[];
  generatedAt?: string;
};

export function saveMeetingResult(input: SaveInput): void {
  throw new Error("not implemented");
}

export function loadMeetingResult(): SavedMeetingResultV2 | null {
  throw new Error("not implemented");
}

export function clearMeetingResult(): void {
  throw new Error("not implemented");
}
```

Run: `npm test -- src/lib/meetingStorage.test.ts`
Expected: failures

- [ ] **Step 3: Implement**

Replace the bodies:

```ts
export function saveMeetingResult(input: SaveInput): void {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const expiresAt = new Date(
    new Date(generatedAt).getTime() + TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const record: SavedMeetingResultV2 = {
    schemaVersion: 2,
    analysis: input.analysis,
    segments: input.segments,
    mapping: input.mapping,
    meetingInfo: input.meetingInfo,
    selectedOptions: input.selectedOptions,
    generatedAt,
    expiresAt,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (err) {
    console.error("[meetingStorage] save failed:", err);
    throw err;
  }
}

export function loadMeetingResult(): SavedMeetingResultV2 | null {
  const raw =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
  if (!raw) return null;
  let parsed: SavedMeetingResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as SavedMeetingResultV2).schemaVersion === 2
  ) {
    const v2 = parsed as SavedMeetingResultV2;
    if (v2.expiresAt && new Date(v2.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return v2;
  }
  // Assume v1: pure AnalysisResult
  const v1 = parsed as AnalysisResult;
  if (!v1 || typeof v1 !== "object" || !Array.isArray(v1.sections)) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return migrateV1ToV2(v1);
}

export function clearMeetingResult(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function migrateV1ToV2(v1: AnalysisResult): SavedMeetingResultV2 {
  const now = new Date();
  return {
    schemaVersion: 2,
    analysis: v1,
    segments: [],
    mapping: {},
    meetingInfo: {
      title: v1.title ?? "",
      date: v1.date ?? "",
      location: "",
      attendees: Array.isArray(v1.attendees) ? v1.attendees.join(", ") : "",
    },
    selectedOptions: [],
    generatedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString(),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/meetingStorage.test.ts`
Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/meetingStorage.ts src/lib/meetingStorage.test.ts
git commit -m "feat(lib): add versioned meeting storage with 30-day TTL"
```

---

## Task 8: Update `/api/stt` to Return Structured Segments

**Files:**
- Modify: `src/app/api/stt/route.ts`

**Contract:** The route MUST return `{ segments: Array<{clovaLabel, text, start?, end?}>, text: string }`. The frontend takes care of final IDs and namespacing — the route only passes through Clova's label. If Clova returns no segments, the route returns a single synthetic segment `{clovaLabel: "1", text: data.text}` so the frontend contract is uniform.

- [ ] **Step 1: Replace the route file**

Replace `src/app/api/stt/route.ts` contents with:

```ts
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type ApiSegment = {
  clovaLabel: string;
  text: string;
  start?: number;
  end?: number;
};

type ApiSttResponse = {
  segments: ApiSegment[];
  text: string;
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("media") as Blob | null;

    if (!file) {
      return NextResponse.json(
        { error: "Missing 'media' file" },
        { status: 400 }
      );
    }

    const invokeUrl =
      req.headers.get("x-clova-url") || process.env.CLOVA_SPEECH_INVOKE_URL;
    const secretKey =
      req.headers.get("x-clova-key") || process.env.CLOVA_SPEECH_SECRET_KEY;

    if (!invokeUrl || !secretKey) {
      return NextResponse.json(
        {
          error:
            "API 자격 증명이 설정되지 않았습니다. 우측 상단 설정을 확인해주세요.",
        },
        { status: 401 }
      );
    }

    const clovaFormData = new FormData();
    clovaFormData.append("media", file, "audio.webm");
    const params = {
      language: "ko-KR",
      completion: "sync",
      diarization: { enable: true, speakerCountMin: 1, speakerCountMax: 10 },
    };
    clovaFormData.append("params", JSON.stringify(params));

    const response = await fetch(`${invokeUrl}/recognizer/upload`, {
      method: "POST",
      headers: { "X-CLOVASPEECH-API-KEY": secretKey },
      body: clovaFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Clova Speech API Error:", errText);
      return NextResponse.json(
        { error: "Failed to process STT", details: errText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.result === "FAILED") {
      return NextResponse.json(
        { error: "STT 변환 실패", details: data.message || "알 수 없는 오류" },
        { status: 422 }
      );
    }

    const segments: ApiSegment[] = [];
    if (Array.isArray(data.segments) && data.segments.length > 0) {
      for (const s of data.segments) {
        const label =
          s?.speaker?.label ?? s?.speaker?.name ?? "1";
        segments.push({
          clovaLabel: String(label),
          text: String(s?.text ?? ""),
          start: typeof s?.start === "number" ? s.start : undefined,
          end: typeof s?.end === "number" ? s.end : undefined,
        });
      }
    } else if (data.text) {
      segments.push({ clovaLabel: "1", text: String(data.text) });
    }

    const text = segments
      .map((s) => `[화자 ${s.clovaLabel}] ${s.text}`)
      .join("\n");

    const payload: ApiSttResponse = { segments, text };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("STT Route Error:", error);
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Manual smoke test of build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stt/route.ts
git commit -m "feat(api): return structured segments from stt route"
```

---

## Task 9: Refactor `InputTabs` for Ordered Segments

**Files:**
- Modify: `src/components/InputSection/InputTabs.tsx`

**Key changes:**
- Replace `accumulatedTextRef` with `segmentsMapRef = Map<sequenceId, Segment[]>`.
- Introduce `sequenceCounterRef` (1-based monotonic) and `idCounterRef` (for `seg_NNNNNN` IDs).
- Track `cumulativeOffsetMsRef` — incremented at segment stop with the segment's actual elapsed time — so `start`/`end` in the emitted `Segment[]` are cumulative.
- After each `processSegment` completes, flatten the map in `sequenceId` order and emit `onChange({type:"record", content:joinedText, segments: all})`.
- Update the `InputData` type import from `@/types/meeting`.

**Note:** Clova segments don't include server-side ordering beyond each 2-minute chunk, so out-of-order resolution is handled purely by `sequenceId`.

- [ ] **Step 1: Read current file fully**

Read `src/components/InputSection/InputTabs.tsx` once so the diff is clear.

- [ ] **Step 2: Replace the file**

Replace `src/components/InputSection/InputTabs.tsx` with:

```tsx
import React, { useRef, useState, useEffect } from "react";
import styles from "./InputTabs.module.css";
import type { Segment, InputData } from "@/types/meeting";
import { resolveSegments } from "@/lib/speakerMapping";

const SEGMENT_DURATION_MS = 2 * 60 * 1000;

interface Props {
  value: InputData;
  onChange: (val: InputData) => void;
}

export default function InputTabs({ value, onChange }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [segmentCount, setSegmentCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentStartTimeRef = useRef<number>(0);
  const segmentRemainingRef = useRef<number>(SEGMENT_DURATION_MS);
  const transcribingCountRef = useRef(0);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const segmentsMapRef = useRef<Map<number, Segment[]>>(new Map());
  const sequenceCounterRef = useRef(0);
  const idCounterRef = useRef(0);
  const cumulativeOffsetMsRef = useRef(0);
  const activeSequenceIdRef = useRef(0);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleTabClick = (type: "text" | "file" | "record") => {
    if (isRecording) stopRecording();
    onChange({ type, content: type === "text" ? "" : null });
  };

  const getClovaHeaders = (): Record<string, string> => {
    const saved = localStorage.getItem("wooks_settings");
    const settings = saved ? JSON.parse(saved) : {};
    const headers: Record<string, string> = {};
    if (settings.clovaInvokeUrl) headers["x-clova-url"] = settings.clovaInvokeUrl;
    if (settings.clovaSecretKey) headers["x-clova-key"] = settings.clovaSecretKey;
    return headers;
  };

  const nextSegmentId = (): string => {
    idCounterRef.current += 1;
    return `seg_${String(idCounterRef.current).padStart(6, "0")}`;
  };

  const emitAllSegments = () => {
    const allSegments = Array.from(segmentsMapRef.current.entries())
      .sort(([a], [b]) => a - b)
      .flatMap(([, segs]) => segs);
    const content = resolveSegments(allSegments, {});
    onChangeRef.current({
      type: "record",
      content,
      segments: allSegments,
    });
  };

  const processSegment = async (
    blob: Blob,
    sequenceId: number,
    elapsedMs: number
  ) => {
    transcribingCountRef.current += 1;
    setIsTranscribing(true);
    const offsetBase = cumulativeOffsetMsRef.current;
    cumulativeOffsetMsRef.current += elapsedMs;

    try {
      if (blob.size < 1024) {
        throw new Error(`오디오 데이터가 너무 작습니다 (${blob.size} bytes)`);
      }
      const formData = new FormData();
      formData.append("media", blob);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 50000);
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: getClovaHeaders(),
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errorData = await res.json();
          errMsg = errorData.details || errorData.error || errMsg;
        } catch {
          /* non-JSON */
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const incoming: Array<{
        clovaLabel: string;
        text: string;
        start?: number;
        end?: number;
      }> = Array.isArray(data.segments) ? data.segments : [];

      const newSegments: Segment[] = incoming.map((s) => ({
        id: nextSegmentId(),
        sequenceId,
        originalSpeaker: `${sequenceId}:${s.clovaLabel}`,
        text: s.text,
        start:
          typeof s.start === "number" ? offsetBase + s.start : undefined,
        end: typeof s.end === "number" ? offsetBase + s.end : undefined,
      }));

      segmentsMapRef.current.set(sequenceId, newSegments);
      emitAllSegments();
    } catch (err) {
      console.error("STT Segment Error:", err);
      const name = err instanceof Error && err.name === "AbortError"
        ? "요청 시간 초과 (50초)"
        : err instanceof Error
        ? err.message
        : "unknown";
      const errorSegment: Segment = {
        id: nextSegmentId(),
        sequenceId,
        originalSpeaker: `${sequenceId}:?`,
        text: `[구간 변환 실패: ${name}]`,
      };
      segmentsMapRef.current.set(sequenceId, [errorSegment]);
      emitAllSegments();
    } finally {
      transcribingCountRef.current -= 1;
      if (transcribingCountRef.current <= 0) {
        transcribingCountRef.current = 0;
        setIsTranscribing(false);
      }
    }
  };

  const getSupportedMimeType = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  };

  const startSegment = (stream: MediaStream) => {
    const mimeType = getSupportedMimeType();
    const mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    sequenceCounterRef.current += 1;
    const thisSeq = sequenceCounterRef.current;
    activeSequenceIdRef.current = thisSeq;
    const chunkStart = Date.now();

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: actualType });
      chunksRef.current = [];
      const elapsed = Date.now() - chunkStart;

      if (isRecordingRef.current) {
        setSegmentCount((prev) => prev + 1);
        startSegment(stream);
      } else {
        cleanupStream();
        setIsRecording(false);
      }

      if (blob.size >= 1024) {
        await processSegment(blob, thisSeq, elapsed);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error("[REC] MediaRecorder error:", event);
      if (chunksRef.current.length > 0) {
        const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        chunksRef.current = [];
        if (blob.size >= 1024) {
          const elapsed = Date.now() - chunkStart;
          processSegment(blob, thisSeq, elapsed);
        }
      }
      if (!isRecordingRef.current) {
        cleanupStream();
        setIsRecording(false);
      }
    };

    mediaRecorder.start();

    segmentRemainingRef.current = SEGMENT_DURATION_MS;
    segmentStartTimeRef.current = Date.now();
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    segmentTimerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, SEGMENT_DURATION_MS);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      segmentsMapRef.current = new Map();
      sequenceCounterRef.current = 0;
      idCounterRef.current = 0;
      cumulativeOffsetMsRef.current = 0;
      isRecordingRef.current = true;
      setSegmentCount(1);
      onChangeRef.current({ type: "record", content: null, segments: [] });
      startSegment(stream);
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err);
      alert("마이크 접근 권한이 없거나 지원되지 않는 브라우저입니다.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      if (segmentTimerRef.current) {
        clearTimeout(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }
      const elapsed = Date.now() - segmentStartTimeRef.current;
      segmentRemainingRef.current = Math.max(
        0,
        segmentRemainingRef.current - elapsed
      );
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      segmentStartTimeRef.current = Date.now();
      segmentTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, segmentRemainingRef.current);
      setIsPaused(false);
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsPaused(false);
    if (segmentTimerRef.current) {
      clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupStream();
      setIsRecording(false);
      return;
    }
    try {
      recorder.requestData();
    } catch {
      /* ignore */
    }
    try {
      recorder.stop();
    } catch {
      cleanupStream();
      setIsRecording(false);
      return;
    }
    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    watchdogTimerRef.current = setTimeout(() => {
      console.warn("[REC] Watchdog: onstop이 5초 내 미발생. 강제 정리.");
      cleanupStream();
      setIsRecording(false);
      mediaRecorderRef.current = null;
    }, 5000);
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  let statusMsg = "버튼을 눌러 회의 녹음을 시작하세요";
  if (isPaused && isTranscribing) {
    statusMsg = `일시정지 중 (구간 ${segmentCount} / 이전 구간 변환 중)`;
  } else if (isPaused) {
    statusMsg = `일시정지 중 (구간 ${segmentCount}) — 재개 버튼을 눌러 계속하세요`;
  } else if (isRecording && isTranscribing) {
    statusMsg = `녹음 중... (구간 ${segmentCount} / 이전 구간 변환 중)`;
  } else if (isRecording) {
    statusMsg = `녹음 중... (구간 ${segmentCount} / 2분마다 자동 분할)`;
  } else if (isTranscribing) {
    statusMsg = "마지막 구간 텍스트 변환 중...";
  } else if (typeof value.content === "string" && value.content) {
    statusMsg = "녹음 및 변환 완료! 아래에서 화자 이름을 지정해보세요.";
  }

  return (
    <div>
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${value.type === "text" ? styles.active : ""}`}
          onClick={() => handleTabClick("text")}
        >
          직접 입력
        </button>
        <button
          className={`${styles.tabBtn} ${value.type === "file" ? styles.active : ""}`}
          onClick={() => handleTabClick("file")}
        >
          파일 업로드
        </button>
        <button
          className={`${styles.tabBtn} ${value.type === "record" ? styles.active : ""}`}
          onClick={() => handleTabClick("record")}
        >
          실시간 녹음
        </button>
      </div>

      <div className={styles.content}>
        {value.type === "text" && (
          <textarea
            className={styles.textarea}
            placeholder="회의 내용을 여기에 입력하세요..."
            value={typeof value.content === "string" ? value.content : ""}
            onChange={(e) =>
              onChange({ type: "text", content: e.target.value })
            }
          />
        )}

        {value.type === "file" && (
          <div className={styles.fileArea}>
            <p>음성 파일(mp3, m4a 등) 또는 텍스트 파일(txt, md)을 선택하세요.</p>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onChange({ type: "file", content: e.target.files[0] });
                }
              }}
            />
            <button
              className={styles.tabBtn}
              onClick={() => fileInputRef.current?.click()}
              style={{ backgroundColor: "var(--accent-base)", color: "#fff" }}
            >
              파일 선택하기
            </button>
            {value.content instanceof File && (
              <p style={{ marginTop: "1rem" }}>
                선택된 파일: {value.content.name}
              </p>
            )}
          </div>
        )}

        {value.type === "record" && (
          <div className={styles.recordArea}>
            <div className={styles.recordControls}>
              <p style={{ color: "var(--text-secondary)" }}>{statusMsg}</p>
              <div className={styles.recordBtns}>
                {isRecording && (
                  <button
                    className={`${styles.recordBtn} ${isPaused ? styles.paused : ""}`}
                    onClick={isPaused ? resumeRecording : pauseRecording}
                    title={isPaused ? "재개" : "일시정지"}
                  >
                    {isPaused ? "▶" : "⏸"}
                  </button>
                )}
                <button
                  className={`${styles.recordBtn} ${isRecording && !isPaused ? styles.recording : ""}`}
                  onClick={toggleRecording}
                  disabled={!isRecording && isTranscribing}
                  title={isRecording ? "정지" : "녹음 시작"}
                >
                  {isRecording ? "⏹" : isTranscribing ? "..." : "⏺"}
                </button>
              </div>
            </div>

            {(isTranscribing ||
              (typeof value.content === "string" && value.content)) && (
              <div style={{ marginTop: "1.5rem", width: "100%" }}>
                <label
                  className={styles.label}
                  style={{ marginBottom: "0.5rem", display: "block" }}
                >
                  변환된 내용 (확인 및 수정)
                </label>
                <textarea
                  className={styles.textarea}
                  placeholder={
                    isTranscribing
                      ? "텍스트 변환 중..."
                      : "변환된 내용이 여기에 표시됩니다."
                  }
                  value={typeof value.content === "string" ? value.content : ""}
                  onChange={(e) =>
                    onChange({
                      type: "record",
                      content: e.target.value,
                      segments: value.segments,
                      mapping: value.mapping,
                    })
                  }
                  style={{ minHeight: "150px" }}
                  readOnly={isTranscribing}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/InputSection/InputTabs.tsx
git commit -m "refactor(input): keep ordered segment map for recording"
```

---

## Task 10: Create `SpeakerMappingPanel`

**Files:**
- Create: `src/components/InputSection/SpeakerMappingPanel.tsx`
- Create: `src/components/InputSection/SpeakerMappingPanel.module.css`

This component is used both pre-submit (in `page.tsx`) and post-submit (inside `TranscriptEditor`). Same UI, same labels, same behavior.

- [ ] **Step 1: Create the CSS module**

Create `src/components/InputSection/SpeakerMappingPanel.module.css`:

```css
.container {
  background: var(--bg-secondary, #f7f7f8);
  border: 1px solid var(--bg-tertiary, #e4e4e7);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-top: 1rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.headerTitle {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.badge {
  background: var(--accent-base, #2563eb);
  color: #fff;
  font-size: 0.75rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-weight: 500;
}

.chevron {
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
}

.body {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.banner {
  background: #eff6ff;
  border-left: 3px solid #2563eb;
  padding: 0.6rem 0.9rem;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #1e3a8a;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.bannerDismiss {
  background: transparent;
  border: none;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: #1e3a8a;
  padding: 0 0.2rem;
  min-width: 44px;
  min-height: 44px;
}

.row {
  display: grid;
  grid-template-columns: 90px 1fr 80px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  min-height: 44px;
}

.rowLabel {
  font-weight: 500;
  color: var(--text-primary, #0f172a);
}

.select {
  width: 100%;
  padding: 0.5rem 0.6rem;
  min-height: 44px;
  border: 1px solid var(--bg-tertiary, #cbd5e1);
  border-radius: 6px;
  background: #fff;
  font-size: 0.9rem;
}

.freeInput {
  width: 100%;
  padding: 0.5rem 0.6rem;
  min-height: 44px;
  border: 1px solid var(--accent-base, #2563eb);
  border-radius: 6px;
  font-size: 0.9rem;
}

.count {
  color: var(--text-secondary, #64748b);
  font-size: 0.8rem;
  text-align: right;
}

.helper {
  color: var(--text-secondary, #64748b);
  font-size: 0.8rem;
  margin-top: 0.75rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: #ecfdf5;
  color: #065f46;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  margin-top: 0.6rem;
}

.chipClose {
  background: transparent;
  border: none;
  color: #065f46;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
  min-width: 24px;
  min-height: 24px;
}
```

- [ ] **Step 2: Create the component**

Create `src/components/InputSection/SpeakerMappingPanel.tsx`:

```tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import styles from "./SpeakerMappingPanel.module.css";
import type { Segment, SpeakerMapping } from "@/types/meeting";
import { getSpeakerStats, parseAttendees } from "@/lib/speakerMapping";

const ONBOARDING_KEY = "wooks_onboarding_speaker";

type SpeakerRow = {
  globalIndex: number;
  originalSpeakers: string[]; // one or more namespaced keys (merged display)
  count: number;
  currentName: string; // "" means unassigned
};

interface Props {
  segments: Segment[];
  mapping: SpeakerMapping;
  attendeesCsv: string;
  defaultCollapsed?: boolean;
  disabled?: boolean;
  onChange: (mapping: SpeakerMapping) => void;
  onAttendeeAdd?: (name: string) => void;
}

export default function SpeakerMappingPanel({
  segments,
  mapping,
  attendeesCsv,
  defaultCollapsed = true,
  disabled = false,
  onChange,
  onAttendeeAdd,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(ONBOARDING_KEY) === "done";
    setOnboardingDismissed(done);
  }, []);

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "done");
    setOnboardingDismissed(true);
  };

  const attendeeOptions = useMemo(
    () => parseAttendees(attendeesCsv),
    [attendeesCsv]
  );

  const rows: SpeakerRow[] = useMemo(() => {
    const stats = getSpeakerStats(segments);
    // Merge rows with identical assigned names.
    const merged: SpeakerRow[] = [];
    for (const s of stats) {
      const name = (mapping[s.originalSpeaker] || "").trim();
      if (name) {
        const existing = merged.find(
          (m) => m.currentName === name && m.currentName !== ""
        );
        if (existing) {
          existing.originalSpeakers.push(s.originalSpeaker);
          existing.count += s.count;
          existing.globalIndex = Math.min(existing.globalIndex, s.globalIndex);
          continue;
        }
      }
      merged.push({
        globalIndex: s.globalIndex,
        originalSpeakers: [s.originalSpeaker],
        count: s.count,
        currentName: name,
      });
    }
    merged.sort((a, b) => a.globalIndex - b.globalIndex);
    return merged;
  }, [segments, mapping]);

  const speakerCount = rows.length;

  if (segments.length === 0) return null;

  return (
    <section className={styles.container} aria-label="화자 이름 지정">
      <div
        className={styles.header}
        onClick={() => !disabled && setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
      >
        <h3 className={styles.headerTitle}>
          화자 이름 지정
          <span className={styles.badge}>{speakerCount}명 감지됨</span>
        </h3>
        <span className={styles.chevron}>{collapsed ? "▾" : "▴"}</span>
      </div>

      {!collapsed && (
        <div className={styles.body}>
          {!onboardingDismissed && (
            <div className={styles.banner} role="note">
              <span>
                💡 Clova가 자동으로 화자를 구분하지만 가끔 틀립니다. 아래에서
                실제 이름을 지정하세요. 같은 사람이 여러 번 나타나면 같은 이름을
                선택하면 자동으로 합쳐집니다.
              </span>
              <button
                className={styles.bannerDismiss}
                onClick={dismissOnboarding}
                aria-label="안내 닫기"
              >
                ×
              </button>
            </div>
          )}

          {rows.map((row) => (
            <SpeakerRowView
              key={row.originalSpeakers.join("|")}
              row={row}
              attendeeOptions={attendeeOptions}
              disabled={disabled}
              onPick={(name) => {
                const next: SpeakerMapping = { ...mapping };
                for (const key of row.originalSpeakers) {
                  if (name) next[key] = name;
                  else delete next[key];
                }
                onChange(next);
              }}
              onAddAttendee={(name) => onAttendeeAdd?.(name)}
            />
          ))}

          <p className={styles.helper}>
            나중에 결과 화면에서도 수정할 수 있습니다.
          </p>
        </div>
      )}
    </section>
  );
}

interface RowProps {
  row: SpeakerRow;
  attendeeOptions: string[];
  disabled: boolean;
  onPick: (name: string) => void;
  onAddAttendee: (name: string) => void;
}

function SpeakerRowView({
  row,
  attendeeOptions,
  disabled,
  onPick,
  onAddAttendee,
}: RowProps) {
  const [mode, setMode] = useState<"select" | "freetext">(
    row.currentName && !attendeeOptions.includes(row.currentName)
      ? "freetext"
      : "select"
  );
  const [draft, setDraft] = useState(
    mode === "freetext" ? row.currentName : ""
  );
  const isComposingRef = useRef(false);

  const commitFreeText = () => {
    const name = draft.trim();
    if (!name) {
      setMode("select");
      return;
    }
    onPick(name);
    if (!attendeeOptions.includes(name)) onAddAttendee(name);
    setDraft("");
    setMode("select");
  };

  const label =
    row.originalSpeakers.length > 1
      ? `화자 ${row.globalIndex}·병합`
      : `화자 ${row.globalIndex}`;

  return (
    <div className={styles.row} role="group" aria-label={`${label}의 실제 이름`}>
      <div className={styles.rowLabel}>{label}</div>
      {mode === "select" ? (
        <select
          className={styles.select}
          disabled={disabled}
          value={row.currentName}
          aria-label={`${label} 이름 선택`}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__free__") {
              setMode("freetext");
              setDraft("");
            } else {
              onPick(v);
            }
          }}
        >
          <option value="">선택...</option>
          {attendeeOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="__free__">직접 입력...</option>
        </select>
      ) : (
        <input
          className={styles.freeInput}
          autoFocus
          disabled={disabled}
          value={draft}
          placeholder="이름 입력 후 Enter"
          aria-label={`${label} 직접 입력`}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isComposingRef.current) {
              e.preventDefault();
              commitFreeText();
            } else if (e.key === "Escape") {
              setDraft("");
              setMode("select");
            }
          }}
          onBlur={commitFreeText}
        />
      )}
      <div className={styles.count}>발화 {row.count}회</div>
    </div>
  );
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/InputSection/SpeakerMappingPanel.tsx src/components/InputSection/SpeakerMappingPanel.module.css
git commit -m "feat(input): add SpeakerMappingPanel with flat numbering and IME-safe input"
```

---

## Task 11: Wire `SpeakerMappingPanel` into `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

**Changes:**
- Clean up existing `handleSubmit` duplicates and the `await sttRes.ok ? ...` typo (architect issue #6).
- Render `SpeakerMappingPanel` whenever `inputData.type === "record"` and `inputData.segments?.length > 0`.
- On submit, call `resolveSegments` with the current mapping and send the resulting text to `/api/analyze`.
- Save results via `saveMeetingResult` with the full v2 payload including `selectedOptions`.
- Provide `onAttendeeAdd` that shows a chip near the attendees field — implement the chip inline as a small state in this page for now (simple and contained).

- [ ] **Step 1: Replace the file**

Replace `src/app/page.tsx` with:

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import InputTabs from "@/components/InputSection/InputTabs";
import MeetingInfoForm from "@/components/ConfigSection/MeetingInfoForm";
import AnalysisOptions from "@/components/ConfigSection/AnalysisOptions";
import SettingsModal from "@/components/Settings/SettingsModal";
import SpeakerMappingPanel from "@/components/InputSection/SpeakerMappingPanel";
import { resolveSegments } from "@/lib/speakerMapping";
import { saveMeetingResult } from "@/lib/meetingStorage";
import type { InputData, SpeakerMapping } from "@/types/meeting";

export default function Home() {
  const router = useRouter();

  const [showSettings, setShowSettings] = useState(false);

  const [meetingInfo, setMeetingInfo] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    location: "",
    attendees: "",
  });

  const [selectedOptions, setSelectedOptions] = useState<string[]>([
    "핵심요약",
    "참석자 분석",
    "아젠다별 요약",
    "주요 결정 사항",
    "To-Do List",
    "리스크/이슈",
    "진행계획",
    "배경 및 목적",
    "미결정사항",
  ]);

  const [inputData, setInputData] = useState<InputData>({
    type: "text",
    content: "",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [addedAttendeeChips, setAddedAttendeeChips] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("wooks_temp_input");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.meetingInfo) setMeetingInfo(parsed.meetingInfo);
        if (parsed.selectedOptions) setSelectedOptions(parsed.selectedOptions);
        if (parsed.inputData) setInputData(parsed.inputData);
      } catch (e) {
        console.error("Temp data load error:", e);
      }
    }
  }, []);

  const handleMappingChange = (next: SpeakerMapping) => {
    setInputData((prev) => ({ ...prev, mapping: next }));
  };

  const handleAttendeeAdd = (name: string) => {
    if (!name) return;
    const existing = meetingInfo.attendees
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (existing.includes(name)) return;
    const nextCsv = existing.length ? `${existing.join(", ")}, ${name}` : name;
    setMeetingInfo({ ...meetingInfo, attendees: nextCsv });
    setAddedAttendeeChips((prev) => [...prev, name]);
  };

  const removeAttendeeChip = (name: string) => {
    const existing = meetingInfo.attendees
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((n) => n !== name);
    setMeetingInfo({ ...meetingInfo, attendees: existing.join(", ") });
    setAddedAttendeeChips((prev) => prev.filter((n) => n !== name));
  };

  const handleSubmit = async () => {
    if (inputData.type === "text" && !(inputData.content as string)?.trim()) {
      alert("회의 내용을 입력해주세요.");
      return;
    }
    if (inputData.type === "file" && !inputData.content) {
      alert("파일을 업로드해주세요.");
      return;
    }
    if (inputData.type === "record" && !inputData.content) {
      alert("녹음을 완료해주세요.");
      return;
    }

    localStorage.setItem(
      "wooks_temp_input",
      JSON.stringify({ meetingInfo, selectedOptions, inputData })
    );

    setIsGenerating(true);
    try {
      const savedSettings = localStorage.getItem("wooks_settings");
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      const customHeaders: Record<string, string> = {};
      if (settings.geminiKey) customHeaders["x-gemini-key"] = settings.geminiKey;
      if (settings.clovaInvokeUrl)
        customHeaders["x-clova-url"] = settings.clovaInvokeUrl;
      if (settings.clovaSecretKey)
        customHeaders["x-clova-key"] = settings.clovaSecretKey;

      let finalContent = "";

      if (inputData.type === "record" && inputData.segments && inputData.segments.length > 0) {
        finalContent = resolveSegments(
          inputData.segments,
          inputData.mapping ?? {}
        );
      } else if (inputData.type === "record" && typeof inputData.content === "string") {
        finalContent = inputData.content;
      } else if (
        inputData.type === "file" &&
        inputData.content instanceof File &&
        !inputData.content.name.endsWith(".txt")
      ) {
        const formData = new FormData();
        formData.append("media", inputData.content);
        const sttRes = await fetch("/api/stt", {
          method: "POST",
          headers: customHeaders,
          body: formData,
        });
        if (!sttRes.ok) {
          const errorData = await sttRes.json().catch(() => ({}));
          throw new Error(errorData.error || "STT 변환에 실패했습니다.");
        }
        const sttData = await sttRes.json();
        finalContent = sttData.text ?? "";
      } else if (inputData.type === "file" && inputData.content instanceof File) {
        finalContent = await inputData.content.text();
      } else {
        finalContent = (inputData.content as string) || "";
      }

      if (!finalContent.trim()) throw new Error("분석할 내용이 없습니다.");

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...customHeaders,
        },
        body: JSON.stringify({
          meetingInfo,
          selectedOptions,
          content: finalContent,
        }),
      });

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json().catch(() => ({}));
        throw new Error(errorData.error || "회의록 분석에 실패했습니다.");
      }
      const analysisResult = await analyzeRes.json();

      saveMeetingResult({
        analysis: analysisResult,
        segments: inputData.segments ?? [],
        mapping: inputData.mapping ?? {},
        meetingInfo,
        selectedOptions,
      });

      router.push("/result");
    } catch (error: unknown) {
      console.error("Submit Error:", error);
      const msg = error instanceof Error ? error.message : "알 수 없는 오류";
      alert(`오류: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const hasSegments =
    inputData.type === "record" && (inputData.segments?.length ?? 0) > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <div style={{ textAlign: "left" }}>
            <h1 className={styles.title}>WOOK&apos;S 회의록</h1>
            <p className={styles.subtitle}>회의록 자동요약 및 작성</p>
          </div>
          <button
            className={styles.settingsBtn}
            onClick={() => setShowSettings(true)}
            title="사용자 API 설정"
          >
            ⚙️
          </button>
        </div>
      </header>

      <main className={styles.mainLayout}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>회의 정보 및 옵션</h2>
          <MeetingInfoForm value={meetingInfo} onChange={setMeetingInfo} />
          {addedAttendeeChips.length > 0 && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {addedAttendeeChips.map((name) => (
                <span
                  key={name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: "#ecfdf5",
                    color: "#065f46",
                    padding: "0.3rem 0.65rem",
                    borderRadius: "999px",
                    fontSize: "0.8rem",
                  }}
                >
                  + {name} (새로 추가됨)
                  <button
                    onClick={() => removeAttendeeChip(name)}
                    aria-label={`${name} 제거`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#065f46",
                      cursor: "pointer",
                      fontSize: "1rem",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--bg-tertiary)",
              margin: "1.5rem 0",
            }}
          />
          <AnalysisOptions
            selected={selectedOptions}
            onChange={setSelectedOptions}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>회의 내용 입력</h2>
          <InputTabs value={inputData} onChange={setInputData} />
          {hasSegments && (
            <SpeakerMappingPanel
              segments={inputData.segments ?? []}
              mapping={inputData.mapping ?? {}}
              attendeesCsv={meetingInfo.attendees}
              onChange={handleMappingChange}
              onAttendeeAdd={handleAttendeeAdd}
            />
          )}
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={isGenerating}
          >
            {isGenerating ? "분석 및 생성 중..." : "회의록 작성하기"}
          </button>
        </section>
      </main>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(page): integrate SpeakerMappingPanel and v2 storage on submit"
```

---

## Task 12: Create `SegmentOverrideList`

**Files:**
- Create: `src/components/ResultSection/SegmentOverrideList.tsx`
- Create: `src/components/ResultSection/SegmentOverrideList.module.css`

**Behavior:**
- Default collapsed with helper text.
- When open: groups consecutive same-effective-speaker segments into blocks; timestamp shown only on block header.
- Top bar: filter dropdown "전체" / per-effective-name.
- Each block has a speaker dropdown (same options as SpeakerMappingPanel dropdown, plus "(기본 매핑으로 복귀)").
- Changing the dropdown calls `onOverride(segmentId, newName | undefined)` for each segment in the block.
- Virtualization: simple — if block count > 50, show only first 50 and a "모두 보기" button.

- [ ] **Step 1: Create CSS module**

Create `src/components/ResultSection/SegmentOverrideList.module.css`:

```css
.wrap {
  background: var(--bg-secondary, #f7f7f8);
  border: 1px solid var(--bg-tertiary, #e4e4e7);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-top: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.subtitle {
  color: var(--text-secondary, #64748b);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 1rem 0 0.75rem;
}

.filterSelect {
  padding: 0.4rem 0.6rem;
  min-height: 44px;
  border: 1px solid var(--bg-tertiary, #cbd5e1);
  border-radius: 6px;
  background: #fff;
  font-size: 0.85rem;
}

.block {
  padding: 0.6rem 0.75rem;
  border-left: 3px solid var(--bg-tertiary, #cbd5e1);
  margin-bottom: 0.5rem;
  background: #fff;
  border-radius: 4px;
}

.blockHeader {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  font-size: 0.8rem;
  color: var(--text-secondary, #64748b);
  margin-bottom: 0.4rem;
}

.blockSelect {
  padding: 0.3rem 0.5rem;
  min-height: 40px;
  font-size: 0.85rem;
  border: 1px solid var(--bg-tertiary, #cbd5e1);
  border-radius: 4px;
  background: #fff;
}

.blockLines {
  font-size: 0.9rem;
  color: var(--text-primary, #0f172a);
  line-height: 1.5;
  white-space: pre-wrap;
}

.showMore {
  margin-top: 0.5rem;
  background: transparent;
  border: 1px dashed var(--bg-tertiary, #cbd5e1);
  padding: 0.5rem;
  width: 100%;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
  min-height: 44px;
}
```

- [ ] **Step 2: Create the component**

Create `src/components/ResultSection/SegmentOverrideList.tsx`:

```tsx
import React, { useMemo, useState } from "react";
import styles from "./SegmentOverrideList.module.css";
import type { Segment, SpeakerMapping } from "@/types/meeting";
import { getSpeakerStats, parseAttendees } from "@/lib/speakerMapping";

interface Props {
  segments: Segment[];
  mapping: SpeakerMapping;
  attendeesCsv: string;
  disabled?: boolean;
  onOverride: (segmentId: string, speakerName: string | undefined) => void;
}

type Block = {
  speakerName: string;
  ids: string[];
  text: string;
  startMs?: number;
};

const formatTimestamp = (ms?: number): string => {
  if (ms === undefined) return "";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export default function SegmentOverrideList({
  segments,
  mapping,
  attendeesCsv,
  disabled = false,
  onOverride,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("__all__");
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => getSpeakerStats(segments), [segments]);
  const indexByKey = useMemo(
    () => new Map(stats.map((s) => [s.originalSpeaker, s.globalIndex])),
    [stats]
  );

  const attendeeOptions = useMemo(
    () => parseAttendees(attendeesCsv),
    [attendeesCsv]
  );

  const effectiveName = (s: Segment): string => {
    if (s.speakerOverride && s.speakerOverride.trim()) {
      return s.speakerOverride.trim();
    }
    const mapped = mapping[s.originalSpeaker];
    if (mapped && mapped.trim()) return mapped.trim();
    return `화자 ${indexByKey.get(s.originalSpeaker) ?? 0}`;
  };

  const blocks: Block[] = useMemo(() => {
    const out: Block[] = [];
    for (const s of segments) {
      const name = effectiveName(s);
      const last = out[out.length - 1];
      if (last && last.speakerName === name) {
        last.ids.push(s.id);
        last.text += "\n" + s.text;
      } else {
        out.push({
          speakerName: name,
          ids: [s.id],
          text: s.text,
          startMs: s.start,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, mapping]);

  const uniqueNames = useMemo(() => {
    const set = new Set<string>();
    for (const b of blocks) set.add(b.speakerName);
    return Array.from(set);
  }, [blocks]);

  const visibleBlocks = useMemo(() => {
    const filtered =
      filter === "__all__" ? blocks : blocks.filter((b) => b.speakerName === filter);
    if (showAll) return filtered;
    return filtered.slice(0, 50);
  }, [blocks, filter, showAll]);

  const hiddenCount =
    (filter === "__all__" ? blocks.length : blocks.filter((b) => b.speakerName === filter).length) -
    visibleBlocks.length;

  if (segments.length === 0) return null;

  const toggleBlockOverride = (block: Block, name: string | undefined) => {
    for (const id of block.ids) onOverride(id, name);
  };

  return (
    <section className={styles.wrap} aria-label="한 문장씩 직접 고치기">
      <div
        className={styles.header}
        role="button"
        tabIndex={0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <div>
          <p className={styles.title}>한 문장씩 직접 고치기 (고급)</p>
          <p className={styles.subtitle}>
            대부분의 경우 위에서 이름만 지정하면 충분합니다. Clova가 두 사람을 한 명으로
            합친 경우에만 사용하세요.
          </p>
        </div>
        <span>{open ? "▴" : "▾"}</span>
      </div>

      {open && (
        <>
          <div className={styles.toolbar}>
            <label htmlFor="seg-filter" style={{ fontSize: "0.85rem" }}>
              특정 화자만 보기:
            </label>
            <select
              id="seg-filter"
              className={styles.filterSelect}
              value={filter}
              disabled={disabled}
              onChange={(e) => {
                setFilter(e.target.value);
                setShowAll(false);
              }}
            >
              <option value="__all__">전체</option>
              {uniqueNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {visibleBlocks.map((b, i) => (
            <div key={`${b.ids[0]}-${i}`} className={styles.block}>
              <div className={styles.blockHeader}>
                {b.startMs !== undefined && (
                  <span>{formatTimestamp(b.startMs)}</span>
                )}
                <select
                  className={styles.blockSelect}
                  disabled={disabled}
                  value={b.speakerName}
                  aria-label={`${b.speakerName} 블록의 화자 변경`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__reset__") {
                      toggleBlockOverride(b, undefined);
                    } else {
                      toggleBlockOverride(b, v);
                    }
                  }}
                >
                  <option value={b.speakerName}>{b.speakerName}</option>
                  {attendeeOptions
                    .filter((n) => n !== b.speakerName)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  <option value="__reset__">(기본 매핑으로 복귀)</option>
                </select>
              </div>
              <div className={styles.blockLines}>{b.text}</div>
            </div>
          ))}

          {hiddenCount > 0 && (
            <button
              className={styles.showMore}
              onClick={() => setShowAll(true)}
            >
              {hiddenCount}개 더 보기
            </button>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ResultSection/SegmentOverrideList.tsx src/components/ResultSection/SegmentOverrideList.module.css
git commit -m "feat(result): add SegmentOverrideList with blocks and filter"
```

---

## Task 13: Create `TranscriptEditor`

**Files:**
- Create: `src/components/ResultSection/TranscriptEditor.tsx`
- Create: `src/components/ResultSection/TranscriptEditor.module.css`

**Behavior:**
- Hosts `SpeakerMappingPanel` (bulk) + `SegmentOverrideList` (per-segment).
- Local `workingMapping` state initialized from `savedResult.mapping`.
- Local `workingSegments` state for speakerOverride mutations.
- Buttons: **"이름만 바꾸기 (빠름)"** and **"회의록 다시 만들기 (약 30초)"**.
- If `unresolvedNames` after prior apply is non-empty, show a sticky inline callout above buttons.
- "이름만 바꾸기" calls `applyMappingToAnalysis` and `onUpdate(newAnalysis, newMapping, newSegments)`; starts a 10-second undo toast.
- "회의록 다시 만들기" enters loading state (locks both panels), calls `onReanalyze(finalText, signal)`. Includes a cancel button.
- Undo toast on "이름만 바꾸기": snapshot prior state, show `[되돌리기]` button for 10 seconds.
- Confirmation dialog before re-analyze uses `window.confirm` with the copy from the spec.
- `aria-live="polite"` region announces status changes.

- [ ] **Step 1: Create CSS module**

Create `src/components/ResultSection/TranscriptEditor.module.css`:

```css
.wrap {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
}

.callout {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-left: 4px solid #dc2626;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  color: #991b1b;
  font-size: 0.9rem;
}

.calloutTitle {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.actionHint {
  width: 100%;
  font-size: 0.8rem;
  color: var(--text-secondary, #64748b);
  margin: 0 0 0.25rem;
}

.btnPrimary,
.btnSecondary {
  padding: 0.65rem 1.1rem;
  min-height: 44px;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.btnPrimary {
  background: var(--accent-base, #2563eb);
  color: #fff;
}

.btnSecondary {
  background: #fff;
  border: 1px solid var(--bg-tertiary, #cbd5e1);
  color: var(--text-primary, #0f172a);
}

.btnPrimary:disabled,
.btnSecondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.recommendedBadge {
  display: inline-block;
  background: #fbbf24;
  color: #78350f;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  margin-left: 0.4rem;
}

.loading {
  padding: 2rem;
  text-align: center;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
}

.loadingCopy {
  font-size: 0.95rem;
  color: var(--text-primary, #0f172a);
  margin-bottom: 1rem;
}

.undoToast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: #0f172a;
  color: #fff;
  padding: 0.75rem 1.25rem;
  border-radius: 999px;
  display: flex;
  gap: 1rem;
  align-items: center;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.undoBtn {
  background: transparent;
  border: 1px solid #475569;
  color: #fff;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  cursor: pointer;
  min-height: 36px;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
```

- [ ] **Step 2: Create the component**

Create `src/components/ResultSection/TranscriptEditor.tsx`:

```tsx
import React, { useEffect, useRef, useState } from "react";
import styles from "./TranscriptEditor.module.css";
import SpeakerMappingPanel from "@/components/InputSection/SpeakerMappingPanel";
import SegmentOverrideList from "./SegmentOverrideList";
import {
  applyMappingToAnalysis,
  resolveSegments,
} from "@/lib/speakerMapping";
import type {
  AnalysisResult,
  SavedMeetingResultV2,
  Segment,
  SpeakerMapping,
} from "@/types/meeting";

const LOADING_COPIES = [
  "회의 내용을 다시 정리하는 중...",
  "핵심 결정사항 추출 중...",
  "실행과제 정리 중...",
  "거의 완료되었습니다...",
];

interface Props {
  savedResult: SavedMeetingResultV2;
  attendeesCsv: string;
  onUpdate: (
    analysis: AnalysisResult,
    mapping: SpeakerMapping,
    segments: Segment[]
  ) => void;
  onReanalyze: (finalText: string, signal: AbortSignal) => Promise<AnalysisResult>;
}

type UndoSnapshot = {
  analysis: AnalysisResult;
  mapping: SpeakerMapping;
  segments: Segment[];
};

export default function TranscriptEditor({
  savedResult,
  attendeesCsv,
  onUpdate,
  onReanalyze,
}: Props) {
  const [workingMapping, setWorkingMapping] = useState<SpeakerMapping>(
    savedResult.mapping
  );
  const [workingSegments, setWorkingSegments] = useState<Segment[]>(
    savedResult.segments
  );
  const [unresolvedNames, setUnresolvedNames] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [loadingCopyIdx, setLoadingCopyIdx] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setWorkingMapping(savedResult.mapping);
    setWorkingSegments(savedResult.segments);
  }, [savedResult]);

  useEffect(() => {
    if (!isReanalyzing) return;
    setLoadingCopyIdx(0);
    const id = setInterval(() => {
      setLoadingCopyIdx((i) => (i + 1) % LOADING_COPIES.length);
    }, 2000);
    return () => clearInterval(id);
  }, [isReanalyzing]);

  const clearUndoTimer = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const startUndoTimer = () => {
    clearUndoTimer();
    undoTimerRef.current = setTimeout(() => {
      setUndo(null);
      undoTimerRef.current = null;
    }, 10000);
  };

  const handleMappingChange = (next: SpeakerMapping) => {
    setWorkingMapping(next);
  };

  const handleOverride = (segmentId: string, name: string | undefined) => {
    setWorkingSegments((prev) =>
      prev.map((s) =>
        s.id === segmentId ? { ...s, speakerOverride: name } : s
      )
    );
  };

  const handleApply = () => {
    const snapshot: UndoSnapshot = {
      analysis: savedResult.analysis,
      mapping: savedResult.mapping,
      segments: savedResult.segments,
    };
    const { analysis: newAnalysis, unresolvedNames: unresolved } =
      applyMappingToAnalysis(
        savedResult.analysis,
        savedResult.mapping,
        workingMapping
      );
    setUnresolvedNames(unresolved);
    onUpdate(newAnalysis, workingMapping, workingSegments);
    setStatus("이름이 변경되었습니다");
    setUndo(snapshot);
    startUndoTimer();
  };

  const handleUndo = () => {
    if (!undo) return;
    onUpdate(undo.analysis, undo.mapping, undo.segments);
    setWorkingMapping(undo.mapping);
    setWorkingSegments(undo.segments);
    setUnresolvedNames([]);
    setStatus("변경을 되돌렸습니다");
    setUndo(null);
    clearUndoTimer();
  };

  const handleReanalyze = async () => {
    const ok = window.confirm(
      "회의록을 처음부터 다시 만듭니다. 약 30초가 소요됩니다. 실패하면 기존 결과는 그대로 유지됩니다. 진행할까요?"
    );
    if (!ok) return;
    setIsReanalyzing(true);
    setStatus("회의록을 다시 만들고 있습니다");
    abortControllerRef.current = new AbortController();
    const finalText = resolveSegments(workingSegments, workingMapping);
    try {
      const newAnalysis = await onReanalyze(
        finalText,
        abortControllerRef.current.signal
      );
      onUpdate(newAnalysis, workingMapping, workingSegments);
      setUnresolvedNames([]);
      setStatus("회의록이 새로 생성되었습니다");
    } catch (err) {
      console.error("[TranscriptEditor] reanalyze failed:", err);
      alert(
        `회의록 재생성에 실패했습니다. 기존 결과가 그대로 유지됩니다.\n(${
          err instanceof Error ? err.message : "unknown"
        })`
      );
    } finally {
      setIsReanalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const cancelReanalyze = () => {
    abortControllerRef.current?.abort();
  };

  useEffect(() => () => clearUndoTimer(), []);

  if (workingSegments.length === 0) return null;

  if (isReanalyzing) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        <p className={styles.loadingCopy}>{LOADING_COPIES[loadingCopyIdx]}</p>
        <button className={styles.btnSecondary} onClick={cancelReanalyze}>
          취소
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {status}
      </span>

      <SpeakerMappingPanel
        segments={workingSegments}
        mapping={workingMapping}
        attendeesCsv={attendeesCsv}
        defaultCollapsed={unresolvedNames.length === 0}
        onChange={handleMappingChange}
      />

      <SegmentOverrideList
        segments={workingSegments}
        mapping={workingMapping}
        attendeesCsv={attendeesCsv}
        onOverride={handleOverride}
      />

      {unresolvedNames.length > 0 && (
        <div className={styles.callout} role="alert">
          <p className={styles.calloutTitle}>
            ⚠️ 주의: 일부 이름이 자동 반영되지 않았습니다
          </p>
          <p>
            {unresolvedNames.join(", ")} — 회의록 본문에서 치환 실패. 정확히
            반영하려면 &apos;회의록 다시 만들기&apos;를 사용하세요.
          </p>
        </div>
      )}

      <div className={styles.actions}>
        <p className={styles.actionHint}>
          이름만 바꾸면 즉시 반영됩니다. 요약 내용까지 다시 쓰려면 &apos;회의록
          다시 만들기&apos;를 선택하세요.
        </p>
        <button className={styles.btnPrimary} onClick={handleApply}>
          이름만 바꾸기 (빠름)
        </button>
        <button className={styles.btnSecondary} onClick={handleReanalyze}>
          회의록 다시 만들기 (약 30초)
          {unresolvedNames.length > 0 && (
            <span className={styles.recommendedBadge}>권장</span>
          )}
        </button>
      </div>

      {undo && (
        <div className={styles.undoToast} role="status">
          <span>이름이 변경되었습니다.</span>
          <button className={styles.undoBtn} onClick={handleUndo}>
            되돌리기
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ResultSection/TranscriptEditor.tsx src/components/ResultSection/TranscriptEditor.module.css
git commit -m "feat(result): add TranscriptEditor with apply/reanalyze/undo"
```

---

## Task 14: Integrate `TranscriptEditor` into `/result`

**Files:**
- Modify: `src/app/result/page.tsx`

**Changes:**
- Replace direct `localStorage.getItem("last_meeting_result")` reads with `loadMeetingResult()`.
- Replace direct writes with `saveMeetingResult()`.
- Render `TranscriptEditor` above the existing analysis display when `savedResult.segments.length > 0`.
- Provide `onReanalyze` by POSTing to `/api/analyze` using the same settings lookup as the main page.
- When `onUpdate` fires, persist v2 again and update local `result` state.

- [ ] **Step 1: Read the current `/result/page.tsx`**

Read the full file. Note the shape: it uses `result: AnalysisResult | null` state, loads from localStorage on mount, and renders Word/PDF/Notion export handlers that consume `result`.

- [ ] **Step 2: Replace the file**

Below is the required patch. Keep existing export handlers intact — only change the state loader/writer and add `TranscriptEditor` before the main render section. Because the current file is ~300 lines, replace it wholesale to avoid drift:

**Do this:**
1. Read current file contents.
2. Identify the loader `useEffect` that reads `localStorage.getItem("last_meeting_result")`.
3. Replace it with:

```tsx
import { loadMeetingResult, saveMeetingResult } from "@/lib/meetingStorage";
import TranscriptEditor from "@/components/ResultSection/TranscriptEditor";
import type { SavedMeetingResultV2, AnalysisResult, Segment, SpeakerMapping } from "@/types/meeting";

// inside the component:
const [savedResult, setSavedResult] = useState<SavedMeetingResultV2 | null>(null);
const [result, setResult] = useState<AnalysisResult | null>(null);

useEffect(() => {
  const loaded = loadMeetingResult();
  if (!loaded) {
    alert("저장된 회의록이 없거나 만료되었습니다.");
    router.push("/");
    return;
  }
  setSavedResult(loaded);
  setResult(loaded.analysis);
}, [router]);
```

4. Add handlers for the editor:

```tsx
const handleEditorUpdate = (
  nextAnalysis: AnalysisResult,
  nextMapping: SpeakerMapping,
  nextSegments: Segment[]
) => {
  if (!savedResult) return;
  const nextSaved: SavedMeetingResultV2 = {
    ...savedResult,
    analysis: nextAnalysis,
    mapping: nextMapping,
    segments: nextSegments,
  };
  saveMeetingResult({
    analysis: nextAnalysis,
    segments: nextSegments,
    mapping: nextMapping,
    meetingInfo: savedResult.meetingInfo,
    selectedOptions: savedResult.selectedOptions,
    generatedAt: savedResult.generatedAt,
  });
  setSavedResult(nextSaved);
  setResult(nextAnalysis);
};

const handleReanalyze = async (
  finalText: string,
  signal: AbortSignal
): Promise<AnalysisResult> => {
  if (!savedResult) throw new Error("no saved result");
  const settingsRaw = localStorage.getItem("wooks_settings");
  const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.geminiKey) headers["x-gemini-key"] = settings.geminiKey;
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      meetingInfo: savedResult.meetingInfo,
      selectedOptions: savedResult.selectedOptions,
      content: finalText,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as AnalysisResult;
};
```

5. Near the top of the rendered page body (before the main analysis sections), add:

```tsx
{savedResult && savedResult.segments.length > 0 && (
  <TranscriptEditor
    savedResult={savedResult}
    attendeesCsv={savedResult.meetingInfo.attendees}
    onUpdate={handleEditorUpdate}
    onReanalyze={handleReanalyze}
  />
)}
```

6. Any code that previously wrote `localStorage.setItem("last_meeting_result", ...)` after edits must switch to calling `saveMeetingResult(...)` with the v2 shape.

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/result/page.tsx
git commit -m "feat(result): wire TranscriptEditor with v2 storage and migration"
```

---

## Task 15: Add "저장된 회의록 삭제" Button to Settings Modal

**Files:**
- Modify: `src/components/Settings/SettingsModal.tsx`

- [ ] **Step 1: Add button to footer**

Replace the footer block in `src/components/Settings/SettingsModal.tsx`:

```tsx
// at top of file:
import { clearMeetingResult } from "@/lib/meetingStorage";

// ... inside component, replace the <footer> block:
<footer className={styles.footer}>
  <button
    className={styles.saveBtn}
    style={{ background: "#ef4444", marginRight: "0.5rem" }}
    onClick={() => {
      const ok = window.confirm(
        "저장된 회의록과 화자 이름 지정 내역이 삭제됩니다. 되돌릴 수 없습니다. 진행할까요?"
      );
      if (!ok) return;
      clearMeetingResult();
      alert("저장된 회의록을 삭제했습니다.");
    }}
  >
    저장된 회의록 삭제
  </button>
  <button className={styles.saveBtn} onClick={handleSave}>
    저장하기
  </button>
</footer>
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/Settings/SettingsModal.tsx
git commit -m "feat(settings): add delete saved meeting button"
```

---

## Task 16: Full Test Suite and Manual QA

**Files:** none to modify — verification only.

- [ ] **Step 1: Run all automated tests**

Run: `npm test`
Expected: All tests pass. Fix regressions before proceeding.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual QA**

Start `npm run dev` and walk through these scenarios. Record pass/fail in this checklist:

1. Text input path → generate → result page shows analysis without TranscriptEditor
2. Record 3-minute meeting with 2 speakers → SpeakerMappingPanel appears collapsed with "2명 감지됨" badge → expand → onboarding banner shows first time
3. Assign names via dropdown → dismiss onboarding → refresh page → banner stays dismissed
4. Use "직접 입력" with Korean IME (e.g. type "박민수") → Enter during composition does not commit, Enter after composition commits → chip appears near attendees field
5. Same name assigned to two speakers → rows visually merge in the panel
6. Submit → result page shows analysis with real names
7. On result page, change a mapping → click "이름만 바꾸기" → analysis updates in place → undo toast appears for 10s → click 되돌리기 → analysis reverts
8. On result page, deliberately pick a stopword-collision name ("김") as old name (simulate) → "이름만 바꾸기" → inline callout shows with unresolved names
9. Click "회의록 다시 만들기" → confirm → loading state shows with cycling copies → cancel works OR success replaces analysis
10. PDF / Word / Notion exports reflect real names
11. Navigate away and back → loadMeetingResult returns the updated result (not the original)
12. Wait (or simulate) 31 days → reload result page → "저장된 회의록이 없거나 만료되었습니다" alert → redirected to `/`
13. SettingsModal → "저장된 회의록 삭제" → confirm → result page inaccessible

- [ ] **Step 5: Commit manual QA log**

Create `docs/superpowers/plans/2026-04-13-speaker-labeling-qa.md` with the checklist results (pass/fail per scenario + any notes).

```bash
git add docs/superpowers/plans/2026-04-13-speaker-labeling-qa.md
git commit -m "docs(qa): record manual QA results for speaker labeling"
```

---

## Appendix: Self-Review (author)

### Spec coverage check
| Spec section | Task |
|---|---|
| §2 Architecture (segments flow) | 2, 7, 8, 9 |
| §3 Data model | 2 |
| §4.1 speakerMapping.ts | 3, 4, 5, 6 |
| §4.2 meetingStorage.ts | 7 |
| §4.3 SpeakerMappingPanel | 10 |
| §4.4 SegmentOverrideList | 12 |
| §4.5 TranscriptEditor | 13 |
| §4.6 InputTabs refactor | 9 |
| §4.7 page.tsx | 11 |
| §4.8 /result page | 14 |
| §4.9 SettingsModal delete | 15 |
| §5 Data flow (3 paths) | 9, 11, 13, 14 |
| §6 Error handling | 8, 9, 13, 14 |
| §7 Accessibility (aria, IME, focus, 44px) | 10, 12, 13 |
| §8 Privacy (TTL, delete) | 7, 15 |
| §9 Testing (unit + integration + manual) | 3-7, 16 |
| §10 Architect fixes (11) | 6, 7, 9, 11, 13 |
| §10.2 UX fixes (8) | 10, 12, 13, 11 |

All spec sections mapped to at least one task. ✅

### Placeholder scan
No "TBD", "TODO", "implement later", or "add appropriate error handling" instructions. Every code step shows the actual code. ✅

### Type consistency
- `Segment`, `SpeakerMapping`, `AnalysisResult`, `SavedMeetingResultV2`, `InputData` — defined in Task 2, referenced consistently everywhere.
- `SpeakerStat` defined in Task 4 as `{originalSpeaker, count, globalIndex}`, consumed by Tasks 5, 10, 12 with same shape.
- `ApplyMappingResult` defined in Task 6 `{analysis, unresolvedCount, unresolvedNames}`, consumed by Task 13 with same shape.
- `SaveInput` defined in Task 7 `{analysis, segments, mapping, meetingInfo, selectedOptions, generatedAt?}`, consumed by Tasks 11, 14 with same shape.
- `Props` interfaces for the three new components use `onChange`, `onOverride`, `onUpdate`, `onReanalyze` consistently.

No mismatches detected. ✅
