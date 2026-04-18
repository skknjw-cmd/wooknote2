# Speaker Diarization Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce user-facing over-counting of speakers after Clova Speech diarization by (1) attendee-aware `speakerCountMax`, (2) silent chunk-boundary merge when Clova mechanically cuts a speaker mid-utterance, and (3) intra-chunk excess-speaker suggestion card with safe local merge.

**Architecture:** Add a new pure-logic module `src/lib/speakerMerge.ts` that computes auto-merge and merge-proposals from raw segments. Add `rawClovaKey` to `Segment` to preserve Clova's original labels for undo. Wire the silent merge into `InputTabs.emitAllSegments`. Surface the undo button, merge badge with tooltip, and suggestion card inside `SpeakerMappingPanel`. Lift recording status from `InputTabs` to `page.tsx` via a single `onStatusChange` callback so the panel can gate its UI on `!isRecording && !isTranscribing`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, React 19, Vitest for unit tests. No new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-04-18-speaker-diarization-improvements-design.md](../specs/2026-04-18-speaker-diarization-improvements-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/types/meeting.ts` | Modify | Add optional `rawClovaKey` field on `Segment` |
| `src/lib/speakerMerge.ts` | Create | Pure logic: `computeBoundaryMerge`, `proposeExcessMerge`, constants |
| `src/lib/speakerMerge.test.ts` | Create | Unit tests for both functions |
| `src/app/api/stt/route.ts` | Modify | Read `x-attendee-count` header → dynamic `speakerCountMax` |
| `src/components/InputSection/InputTabs.tsx` | Modify | Accept `attendeesCsv` prop; send attendee-count header; set `rawClovaKey` at segment creation; run `computeBoundaryMerge` before emit; fire `onStatusChange` |
| `src/app/page.tsx` | Modify | Pass `attendeesCsv` and `onStatusChange` to `InputTabs`; include attendee-count header on file-upload STT call; own `recorderStatus` state; `handleApplyExcessMerge` and `handleGlobalUndo` callbacks; pass new props to `SpeakerMappingPanel` |
| `src/components/InputSection/SpeakerMappingPanel.tsx` | Modify | New props (`isRecording`, `isTranscribing`, `onApplyExcessMerge`, `onGlobalUndo`); per-row auto-merge badge with tooltip; header "자동 병합 전체 취소" button; suggestion card at top of body |
| `src/components/InputSection/SpeakerMappingPanel.module.css` | Modify | New classes: `autoBadge`, `undoButton`, `suggestCard`, `suggestCardActions` |

---

## Task 1: Add `rawClovaKey` field to `Segment`

**Files:**
- Modify: `src/types/meeting.ts`

- [ ] **Step 1: Add the optional field**

Edit [src/types/meeting.ts](../../src/types/meeting.ts). In the `Segment` type, insert `rawClovaKey` right after `originalSpeaker`:

```ts
export type Segment = {
  id: string; // "seg_000001" monotonic counter
  sequenceId: number; // recording chunk order
  originalSpeaker: string; // e.g. "1:1", "2:1" — group key; may be rewritten by auto-merge
  rawClovaKey?: string; // immutable "${sequenceId}:${clovaLabel}" for undo of auto-merge
  text: string;
  start?: number; // cumulative ms from recording start
  end?: number;
  speakerOverride?: string; // per-segment override, wins over mapping
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (optional field is backward-compatible).

- [ ] **Step 3: Commit**

```bash
git add src/types/meeting.ts
git commit -m "feat(types): add optional rawClovaKey to Segment for auto-merge undo"
```

---

## Task 2: Implement `computeBoundaryMerge` (TDD)

**Files:**
- Create: `src/lib/speakerMerge.ts`
- Create: `src/lib/speakerMerge.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/speakerMerge.test.ts` with all test cases upfront:

```ts
import { describe, it, expect } from "vitest";
import { computeBoundaryMerge } from "./speakerMerge";
import type { Segment } from "@/types/meeting";

const seg = (
  id: number,
  seq: number,
  speaker: string,
  text = "x",
  start?: number,
  end?: number
): Segment => ({
  id: `seg_${String(id).padStart(6, "0")}`,
  sequenceId: seq,
  originalSpeaker: speaker,
  rawClovaKey: speaker,
  text,
  start,
  end,
});

describe("computeBoundaryMerge", () => {
  it("merges across boundary when gap < 500ms and no terminator", () => {
    const segs = [
      seg(1, 1, "1:1", "말하는 중", 0, 100),
      seg(2, 1, "1:2", "이어서", 100, 200),
      seg(3, 2, "2:1", "계속", 200, 300),
    ];
    const result = computeBoundaryMerge(segs);
    // last of chunk 1 is 1:2 end=200, first of chunk 2 is 2:1 start=200, gap=0, no terminator
    expect(result[2].originalSpeaker).toBe("1:2");
    expect(result[2].rawClovaKey).toBe("2:1");
  });

  it("does not merge when lastSeg ends with period", () => {
    const segs = [
      seg(1, 1, "1:1", "끝났다.", 0, 100),
      seg(2, 2, "2:1", "새 사람", 100, 200),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
  });

  it("does not merge when lastSeg ends with ? or !", () => {
    for (const term of ["?", "!"]) {
      const segs = [
        seg(1, 1, "1:1", `끝났다${term}`, 0, 100),
        seg(2, 2, "2:1", "새 사람", 100, 200),
      ];
      expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
    }
  });

  it("does not merge when text ends with CJK fullwidth terminator", () => {
    const segs = [
      seg(1, 1, "1:1", "끝。", 0, 100),
      seg(2, 2, "2:1", "a", 100, 200),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
  });

  it("does not merge when gap >= 500ms", () => {
    const segs = [
      seg(1, 1, "1:1", "말하다가", 0, 100),
      seg(2, 2, "2:1", "한참 뒤", 700, 800),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
  });

  it("chains across three chunks when all gaps are tight and non-terminated", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 2, "2:2", "b", 100, 200),
      seg(3, 3, "3:3", "c", 200, 300),
    ];
    const result = computeBoundaryMerge(segs);
    expect(result[0].originalSpeaker).toBe("1:1");
    expect(result[1].originalSpeaker).toBe("1:1");
    expect(result[2].originalSpeaker).toBe("1:1");
  });

  it("skips pair when start/end missing", () => {
    const segs = [
      seg(1, 1, "1:1", "a"), // no timing
      seg(2, 2, "2:1", "b", 100, 200),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("2:1");
  });

  it("does not merge across a failed chunk (seq:? with no timing)", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 2, "2:?", "[실패]"), // no timing
      seg(3, 3, "3:1", "c", 200, 300),
    ];
    expect(computeBoundaryMerge(segs)[2].originalSpeaker).toBe("3:1");
  });

  it("is a no-op when boundary speakers are already the same", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 2, "1:1", "b", 100, 200),
    ];
    expect(computeBoundaryMerge(segs)[1].originalSpeaker).toBe("1:1");
  });

  it("does not mutate the input array or its segments", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 2, "2:1", "b", 100, 200),
    ];
    const before = JSON.stringify(segs);
    computeBoundaryMerge(segs);
    expect(JSON.stringify(segs)).toBe(before);
  });

  it("returns input unchanged when there's only one chunk", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 1, "1:2", "b", 100, 200),
    ];
    const result = computeBoundaryMerge(segs);
    expect(result[0].originalSpeaker).toBe("1:1");
    expect(result[1].originalSpeaker).toBe("1:2");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/lib/speakerMerge.test.ts`
Expected: FAIL with `Cannot find module './speakerMerge'` (or similar import error).

- [ ] **Step 3: Implement `computeBoundaryMerge`**

Create `src/lib/speakerMerge.ts`:

```ts
import type { Segment } from "@/types/meeting";

export const BOUNDARY_MERGE_GAP_MS = 500;
export const SENTENCE_TERMINATORS = /[.?!。？！]\s*$/;

/**
 * Silently merges speakers across chunk boundaries when the previous chunk's
 * last utterance appears to have been mechanically cut by the 2-min timer —
 * short gap (< BOUNDARY_MERGE_GAP_MS) AND no sentence-terminating punctuation.
 * Pure: never mutates the input.
 */
export function computeBoundaryMerge(segments: Segment[]): Segment[] {
  if (segments.length < 2) return segments.slice();

  const out: Segment[] = segments.map((s) => ({ ...s }));

  const byChunk = new Map<number, Segment[]>();
  for (const s of out) {
    const bucket = byChunk.get(s.sequenceId);
    if (bucket) bucket.push(s);
    else byChunk.set(s.sequenceId, [s]);
  }

  const sequenceIds = Array.from(byChunk.keys()).sort((a, b) => a - b);

  for (let i = 0; i + 1 < sequenceIds.length; i++) {
    const chunkN = byChunk.get(sequenceIds[i])!;
    const chunkM = byChunk.get(sequenceIds[i + 1])!;

    let lastSeg: Segment | undefined;
    for (const s of chunkN) {
      if (typeof s.start !== "number" || typeof s.end !== "number") continue;
      if (!lastSeg || s.start > (lastSeg.start as number)) lastSeg = s;
    }

    let firstSeg: Segment | undefined;
    for (const s of chunkM) {
      if (typeof s.start !== "number" || typeof s.end !== "number") continue;
      if (!firstSeg || s.start < (firstSeg.start as number)) firstSeg = s;
    }

    if (!lastSeg || !firstSeg) continue;
    if (lastSeg.originalSpeaker === firstSeg.originalSpeaker) continue;

    const gap = (firstSeg.start as number) - (lastSeg.end as number);
    if (gap >= BOUNDARY_MERGE_GAP_MS) continue;

    if (SENTENCE_TERMINATORS.test((lastSeg.text ?? "").trim())) continue;

    const fromKey = firstSeg.originalSpeaker;
    const toKey = lastSeg.originalSpeaker;
    for (const s of chunkM) {
      if (s.originalSpeaker === fromKey) s.originalSpeaker = toKey;
    }
  }

  return out;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/lib/speakerMerge.test.ts`
Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/speakerMerge.ts src/lib/speakerMerge.test.ts
git commit -m "feat(lib): add computeBoundaryMerge for silent cross-chunk merge"
```

---

## Task 3: Implement `proposeExcessMerge` (TDD)

**Files:**
- Modify: `src/lib/speakerMerge.ts`
- Modify: `src/lib/speakerMerge.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `src/lib/speakerMerge.test.ts`:

```ts
import { proposeExcessMerge } from "./speakerMerge";

describe("proposeExcessMerge", () => {
  it("returns empty when attendeeCount <= 0", () => {
    const segs = [seg(1, 1, "1:1", "a", 0, 100)];
    expect(proposeExcessMerge(segs, 0)).toEqual([]);
    expect(proposeExcessMerge(segs, -1)).toEqual([]);
  });

  it("returns empty when each chunk has <= attendeeCount distinct speakers", () => {
    const segs = [
      seg(1, 1, "1:1", "a", 0, 100),
      seg(2, 1, "1:2", "b", 100, 200),
      seg(3, 2, "2:1", "c", 200, 300),
      seg(4, 2, "2:2", "d", 300, 400),
    ];
    expect(proposeExcessMerge(segs, 2)).toEqual([]);
  });

  it("proposes intra-chunk merges for a single over-split chunk", () => {
    const segs = [
      seg(1, 1, "1:1", "x", 0, 50),
      seg(2, 1, "1:1", "x", 100, 150),
      seg(3, 1, "1:1", "x", 250, 300),
      seg(4, 1, "1:2", "y", 350, 400),
      seg(5, 1, "1:2", "y", 550, 600),
      seg(6, 1, "1:3", "z", 100, 120), // 1-utter excess, near 1:1
      seg(7, 1, "1:4", "w", 700, 720), // 1-utter excess, near 1:2 tail
    ];
    const props = proposeExcessMerge(segs, 2);
    expect(props).toHaveLength(2);
    const p3 = props.find((p) => p.from === "1:3");
    const p4 = props.find((p) => p.from === "1:4");
    expect(p3?.to).toBe("1:1");
    expect(p4?.to).toBe("1:2");
  });

  it("never proposes cross-chunk merges (intra-chunk safety invariant)", () => {
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:2", "y", 100, 200),
      seg(3, 1, "1:3", "z", 200, 300),
      seg(4, 2, "2:1", "a", 400, 500),
      seg(5, 2, "2:2", "b", 500, 600),
      seg(6, 2, "2:3", "c", 600, 700),
    ];
    const props = proposeExcessMerge(segs, 2);
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) {
      expect(p.from.split(":")[0]).toBe(p.to.split(":")[0]);
    }
  });

  it("does NOT propose merges when each chunk has exactly attendeeCount speakers (dominant-speaker trap regression)", () => {
    // A dominates globally (1:1, 2:1, 3:1 are frequent), B is less frequent
    // (1:2, 2:2, 3:2). Each chunk has exactly 2 speakers. attendeeCount = 2.
    // A global-top-N algorithm would misclassify B as excess; per-chunk
    // algorithm correctly returns zero proposals.
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:1", "x", 100, 200),
      seg(3, 1, "1:2", "y", 200, 300),
      seg(4, 2, "2:1", "x", 400, 500),
      seg(5, 2, "2:1", "x", 500, 600),
      seg(6, 2, "2:2", "y", 600, 700),
      seg(7, 3, "3:1", "x", 800, 900),
      seg(8, 3, "3:2", "y", 900, 1000),
    ];
    expect(proposeExcessMerge(segs, 2)).toEqual([]);
  });

  it("falls back to most-frequent chunk-major when excess has no timing", () => {
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:1", "x", 100, 200),
      seg(3, 1, "1:2", "y", 300, 400),
      seg(4, 1, "1:3", "z"), // no timing
    ];
    expect(proposeExcessMerge(segs, 2)).toEqual([{ from: "1:3", to: "1:1" }]);
  });

  it("breaks adjacency ties by higher within-chunk utterance count", () => {
    // 1:1 count 3 at 0,100,200; 1:2 count 2 at 300,400; 1:3 count 1 at 250.
    // Distance from 1:3 (250) to 1:1 = min(250,150,50) = 50.
    // Distance from 1:3 (250) to 1:2 = min(50,150) = 50. Tie.
    // Break by count: 1:1 (3) > 1:2 (2) → pick 1:1.
    const segs = [
      seg(1, 1, "1:1", "x", 0, 10),
      seg(2, 1, "1:1", "x", 100, 110),
      seg(3, 1, "1:1", "x", 200, 210),
      seg(4, 1, "1:2", "y", 300, 310),
      seg(5, 1, "1:2", "y", 400, 410),
      seg(6, 1, "1:3", "z", 250, 260),
    ];
    expect(proposeExcessMerge(segs, 2)).toEqual([{ from: "1:3", to: "1:1" }]);
  });

  it("evaluates each chunk independently", () => {
    // Chunk 1 has 3 speakers (over), chunk 2 has 2 (under). One proposal from chunk 1.
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:1", "x", 100, 200),
      seg(3, 1, "1:2", "y", 200, 300),
      seg(4, 1, "1:3", "z", 300, 400),
      seg(5, 2, "2:1", "a", 500, 600),
      seg(6, 2, "2:2", "b", 600, 700),
    ];
    const props = proposeExcessMerge(segs, 2);
    expect(props).toHaveLength(1);
    expect(props[0].from.startsWith("1:")).toBe(true);
  });

  it("does not mutate input segments", () => {
    const segs = [
      seg(1, 1, "1:1", "x", 0, 100),
      seg(2, 1, "1:2", "y", 200, 300),
      seg(3, 1, "1:3", "z", 400, 500),
    ];
    const before = JSON.stringify(segs);
    proposeExcessMerge(segs, 2);
    expect(JSON.stringify(segs)).toBe(before);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/lib/speakerMerge.test.ts`
Expected: new test suite fails (`proposeExcessMerge is not a function`).

- [ ] **Step 3: Implement `proposeExcessMerge`**

Append to `src/lib/speakerMerge.ts`:

```ts
export type MergeProposal = { from: string; to: string };

/**
 * Proposes intra-chunk merges for chunks where Clova over-split speakers
 * (more distinct speakers within one chunk than attendeeCount). All proposals
 * stay within a single chunk — never merges across chunks.
 * Pure: never mutates the input.
 */
export function proposeExcessMerge(
  segments: Segment[],
  attendeeCount: number
): MergeProposal[] {
  if (attendeeCount <= 0) return [];

  const byChunk = new Map<number, Segment[]>();
  for (const s of segments) {
    const bucket = byChunk.get(s.sequenceId);
    if (bucket) bucket.push(s);
    else byChunk.set(s.sequenceId, [s]);
  }

  const proposals: MergeProposal[] = [];

  for (const chunkSegments of byChunk.values()) {
    const counts = new Map<string, number>();
    const segsByKey = new Map<string, Segment[]>();
    for (const s of chunkSegments) {
      counts.set(s.originalSpeaker, (counts.get(s.originalSpeaker) ?? 0) + 1);
      const arr = segsByKey.get(s.originalSpeaker);
      if (arr) arr.push(s);
      else segsByKey.set(s.originalSpeaker, [s]);
    }

    const distinctKeys = Array.from(counts.keys());
    if (distinctKeys.length <= attendeeCount) continue;

    const sorted = distinctKeys
      .map((k) => ({ key: k, count: counts.get(k)! }))
      .sort((a, b) => b.count - a.count);

    const major = sorted.slice(0, attendeeCount);
    const excess = sorted.slice(attendeeCount);

    for (const E of excess) {
      const eSegs = segsByKey.get(E.key)!;
      const anyMissingTiming = eSegs.some((s) => typeof s.start !== "number");

      if (anyMissingTiming) {
        proposals.push({ from: E.key, to: major[0].key });
        continue;
      }

      let bestM: { key: string; count: number } | null = null;
      let bestDistance = Infinity;

      for (const M of major) {
        const mStarts = (segsByKey.get(M.key) ?? [])
          .map((s) => s.start)
          .filter((x): x is number => typeof x === "number");
        if (mStarts.length === 0) continue;

        let aggregate = 0;
        for (const s of eSegs) {
          const sStart = s.start as number;
          let minDist = Infinity;
          for (const ms of mStarts) {
            const d = Math.abs(sStart - ms);
            if (d < minDist) minDist = d;
          }
          aggregate += minDist;
        }

        if (aggregate < bestDistance) {
          bestDistance = aggregate;
          bestM = M;
        } else if (
          aggregate === bestDistance &&
          bestM &&
          M.count > bestM.count
        ) {
          bestM = M;
        }
      }

      proposals.push({ from: E.key, to: bestM ? bestM.key : major[0].key });
    }
  }

  return proposals;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/lib/speakerMerge.test.ts`
Expected: all tests pass (11 from Task 2 + 9 new = 20 total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/speakerMerge.ts src/lib/speakerMerge.test.ts
git commit -m "feat(lib): add proposeExcessMerge for intra-chunk over-split defense"
```

---

## Task 4: Dynamic `speakerCountMax` — server side

**Files:**
- Modify: `src/app/api/stt/route.ts`

- [ ] **Step 1: Read the header and compute the cap**

Edit [src/app/api/stt/route.ts](../../src/app/api/stt/route.ts). Replace lines 46–51 (the `params` construction):

```ts
const attendeeCountRaw = req.headers.get("x-attendee-count");
const attendeeCount = parseInt(attendeeCountRaw ?? "", 10);
const speakerCountMax =
  Number.isFinite(attendeeCount) && attendeeCount > 0
    ? attendeeCount + 1
    : 10;

const params = {
  language: "ko-KR",
  completion: "sync",
  diarization: {
    enable: true,
    speakerCountMin: 1,
    speakerCountMax,
  },
};
clovaFormData.append("params", JSON.stringify(params));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stt/route.ts
git commit -m "feat(api): derive speakerCountMax from x-attendee-count header"
```

---

## Task 5: Dynamic `speakerCountMax` — client side (both paths)

**Files:**
- Modify: `src/components/InputSection/InputTabs.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add `attendeesCsv` prop to `InputTabs`**

Edit [src/components/InputSection/InputTabs.tsx](../../src/components/InputSection/InputTabs.tsx).

Update the import line to include `parseAttendees`:

```ts
import { resolveSegments, parseAttendees } from "@/lib/speakerMapping";
```

Update the `Props` interface (around line 8):

```ts
interface Props {
  value: InputData;
  attendeesCsv: string;
  onChange: (val: InputData) => void;
}
```

Update the component signature:

```ts
export default function InputTabs({ value, attendeesCsv, onChange }: Props) {
```

- [ ] **Step 2: Inject the `x-attendee-count` header**

Still in `InputTabs.tsx`, replace `getClovaHeaders` (currently around lines 69–76):

```ts
const getClovaHeaders = (): Record<string, string> => {
  const saved = localStorage.getItem("wooks_settings");
  const settings = saved ? JSON.parse(saved) : {};
  const headers: Record<string, string> = {};
  if (settings.clovaInvokeUrl) headers["x-clova-url"] = settings.clovaInvokeUrl;
  if (settings.clovaSecretKey) headers["x-clova-key"] = settings.clovaSecretKey;
  const count = parseAttendees(attendeesCsv).length;
  if (count > 0) headers["x-attendee-count"] = String(count);
  return headers;
};
```

- [ ] **Step 3: Pass `attendeesCsv` from `page.tsx`**

Edit [src/app/page.tsx](../../src/app/page.tsx). Update the `<InputTabs>` call (currently around line 284):

```tsx
<InputTabs
  value={inputData}
  attendeesCsv={meetingInfo.attendees}
  onChange={setInputData}
/>
```

- [ ] **Step 4: Send header on file-upload STT call**

In `page.tsx`, locate the `customHeaders` block (lines ~110–115) and extend it:

```ts
const customHeaders: Record<string, string> = {};
if (settings.geminiKey) customHeaders["x-gemini-key"] = settings.geminiKey;
if (settings.clovaInvokeUrl)
  customHeaders["x-clova-url"] = settings.clovaInvokeUrl;
if (settings.clovaSecretKey)
  customHeaders["x-clova-key"] = settings.clovaSecretKey;
const attendeeCount = meetingInfo.attendees
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean).length;
if (attendeeCount > 0)
  customHeaders["x-attendee-count"] = String(attendeeCount);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/InputSection/InputTabs.tsx src/app/page.tsx
git commit -m "feat(stt): send x-attendee-count header from both STT call sites"
```

---

## Task 6: Set `rawClovaKey` and run `computeBoundaryMerge` in `InputTabs`

**Files:**
- Modify: `src/components/InputSection/InputTabs.tsx`

- [ ] **Step 1: Import `computeBoundaryMerge`**

Add to the top of [src/components/InputSection/InputTabs.tsx](../../src/components/InputSection/InputTabs.tsx):

```ts
import { computeBoundaryMerge } from "@/lib/speakerMerge";
```

- [ ] **Step 2: Populate `rawClovaKey` at segment creation**

In `processSegment`, locate the block that builds `newSegments` (currently lines ~153–161). Replace with:

```ts
const newSegments: Segment[] = incoming.map((s) => {
  const key = `${sequenceId}:${s.clovaLabel}`;
  return {
    id: nextSegmentId(),
    sequenceId,
    originalSpeaker: key,
    rawClovaKey: key,
    text: s.text,
    start:
      typeof s.start === "number" ? offsetBase + s.start : undefined,
    end: typeof s.end === "number" ? offsetBase + s.end : undefined,
  };
});
```

Also update the three error-segment constructions in `processSegment` and `mediaRecorder.onstop` to include `rawClovaKey`. They are around lines 102–112 and 172–177. For each, change the object literal to:

```ts
const errorSegment: Segment = {
  id: nextSegmentId(),
  sequenceId,
  originalSpeaker: `${sequenceId}:?`,
  rawClovaKey: `${sequenceId}:?`,
  text: `[구간 변환 실패: ...]`, // keep the existing message text
};
```

(There are two error-segment constructions in `processSegment` — at the size-check early-return and in the catch block. Update both.)

- [ ] **Step 3: Run `computeBoundaryMerge` before every emit**

Replace `emitAllSegments` (currently lines 83–93):

```ts
const emitAllSegments = () => {
  const rawSegments = Array.from(segmentsMapRef.current.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([, segs]) => segs);
  const mergedSegments = computeBoundaryMerge(rawSegments);
  const content = resolveSegments(mergedSegments, {});
  onChangeRef.current({
    type: "record",
    content,
    segments: mergedSegments,
  });
};
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/InputSection/InputTabs.tsx
git commit -m "feat(record): preserve rawClovaKey and apply boundary auto-merge on emit"
```

---

## Task 7: Lift recording status via `onStatusChange`

**Files:**
- Modify: `src/components/InputSection/InputTabs.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add `onStatusChange` prop to `InputTabs`**

Update the `Props` interface:

```ts
interface Props {
  value: InputData;
  attendeesCsv: string;
  onChange: (val: InputData) => void;
  onStatusChange?: (status: {
    isRecording: boolean;
    isTranscribing: boolean;
  }) => void;
}
```

Update the component signature:

```ts
export default function InputTabs({
  value,
  attendeesCsv,
  onChange,
  onStatusChange,
}: Props) {
```

- [ ] **Step 2: Fire the callback on state change**

Add a ref mirror so the latest callback is always used, and a single effect that fires it. Insert near the existing `onChangeRef` block (around lines 35–38):

```ts
const onStatusChangeRef = useRef(onStatusChange);
useEffect(() => {
  onStatusChangeRef.current = onStatusChange;
});

useEffect(() => {
  onStatusChangeRef.current?.({ isRecording, isTranscribing });
}, [isRecording, isTranscribing]);
```

- [ ] **Step 3: Mirror status in `page.tsx`**

In [src/app/page.tsx](../../src/app/page.tsx), add state near the other `useState` declarations (after `addedAttendeeChips` around line 45):

```tsx
const [recorderStatus, setRecorderStatus] = useState({
  isRecording: false,
  isTranscribing: false,
});
```

Update the `<InputTabs>` call:

```tsx
<InputTabs
  value={inputData}
  attendeesCsv={meetingInfo.attendees}
  onChange={setInputData}
  onStatusChange={setRecorderStatus}
/>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/InputSection/InputTabs.tsx src/app/page.tsx
git commit -m "feat(record): lift isRecording/isTranscribing via onStatusChange"
```

---

## Task 8: Add `handleApplyExcessMerge` and `handleGlobalUndo` to `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Import `MergeProposal`**

Near the top of [src/app/page.tsx](../../src/app/page.tsx), add to the imports:

```ts
import type { MergeProposal } from "@/lib/speakerMerge";
```

- [ ] **Step 2: Add the two callbacks**

Insert the callbacks next to `handleMappingChange` (around line 61):

```tsx
const handleApplyExcessMerge = (proposals: MergeProposal[]) => {
  setInputData((prev) => {
    const segs = prev.segments ?? [];
    if (segs.length === 0 || proposals.length === 0) return prev;
    const rename = new Map(proposals.map((p) => [p.from, p.to]));
    const nextSegs = segs.map((s) => {
      const to = rename.get(s.originalSpeaker);
      return to ? { ...s, originalSpeaker: to } : s;
    });
    return { ...prev, segments: nextSegs };
  });
};

const handleGlobalUndo = () => {
  setInputData((prev) => {
    const segs = prev.segments ?? [];
    if (segs.length === 0) return prev;
    const nextSegs = segs.map((s) =>
      s.rawClovaKey && s.rawClovaKey !== s.originalSpeaker
        ? { ...s, originalSpeaker: s.rawClovaKey }
        : s
    );
    return { ...prev, segments: nextSegs };
  });
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`SpeakerMappingPanel` doesn't use these yet — wired in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(page): add handleApplyExcessMerge and handleGlobalUndo callbacks"
```

---

## Task 9: Extend `SpeakerMappingPanel` props and wire from `page.tsx`

**Files:**
- Modify: `src/components/InputSection/SpeakerMappingPanel.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Extend `Props` in `SpeakerMappingPanel`**

Edit [src/components/InputSection/SpeakerMappingPanel.tsx](../../src/components/InputSection/SpeakerMappingPanel.tsx). Update the imports:

```ts
import type { Segment, SpeakerMapping } from "@/types/meeting";
import { getSpeakerStats, parseAttendees } from "@/lib/speakerMapping";
import { proposeExcessMerge, type MergeProposal } from "@/lib/speakerMerge";
```

Replace the `Props` interface (around lines 15–23):

```ts
interface Props {
  segments: Segment[];
  mapping: SpeakerMapping;
  attendeesCsv: string;
  defaultCollapsed?: boolean;
  disabled?: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  onChange: (mapping: SpeakerMapping) => void;
  onAttendeeAdd?: (name: string) => void;
  onApplyExcessMerge: (proposals: MergeProposal[]) => void;
  onGlobalUndo: () => void;
}
```

Update the component signature:

```ts
export default function SpeakerMappingPanel({
  segments,
  mapping,
  attendeesCsv,
  defaultCollapsed = true,
  disabled = false,
  isRecording,
  isTranscribing,
  onChange,
  onAttendeeAdd,
  onApplyExcessMerge,
  onGlobalUndo,
}: Props) {
```

- [ ] **Step 2: Wire new props from `page.tsx`**

Edit the `<SpeakerMappingPanel>` call in `page.tsx` (around lines 286–292):

```tsx
<SpeakerMappingPanel
  segments={inputData.segments ?? []}
  mapping={inputData.mapping ?? {}}
  attendeesCsv={meetingInfo.attendees}
  isRecording={recorderStatus.isRecording}
  isTranscribing={recorderStatus.isTranscribing}
  onChange={handleMappingChange}
  onAttendeeAdd={handleAttendeeAdd}
  onApplyExcessMerge={handleApplyExcessMerge}
  onGlobalUndo={handleGlobalUndo}
/>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/InputSection/SpeakerMappingPanel.tsx src/app/page.tsx
git commit -m "feat(panel): extend props for auto-merge UX wiring"
```

---

## Task 10: Merge badge with tooltip

**Files:**
- Modify: `src/components/InputSection/SpeakerMappingPanel.tsx`
- Modify: `src/components/InputSection/SpeakerMappingPanel.module.css`

- [ ] **Step 1: Compute absorbed keys per row**

In [SpeakerMappingPanel.tsx](../../src/components/InputSection/SpeakerMappingPanel.tsx), update the `SpeakerRow` type (around line 8) and the `rows` `useMemo` (around lines 53–78).

Update the type:

```ts
type SpeakerRow = {
  globalIndex: number;
  originalSpeakers: string[];
  count: number;
  currentName: string;
  absorbedRawKeys: string[]; // rawClovaKey values absorbed via auto-merge
};
```

Replace the `rows` memo:

```ts
const rows: SpeakerRow[] = useMemo(() => {
  const stats = getSpeakerStats(segments);

  // Pre-compute per-originalSpeaker absorbed raw keys (rawClovaKey != originalSpeaker)
  const absorbedByKey = new Map<string, Set<string>>();
  for (const s of segments) {
    if (s.rawClovaKey && s.rawClovaKey !== s.originalSpeaker) {
      const set = absorbedByKey.get(s.originalSpeaker) ?? new Set<string>();
      set.add(s.rawClovaKey);
      absorbedByKey.set(s.originalSpeaker, set);
    }
  }

  const merged: SpeakerRow[] = [];
  for (const s of stats) {
    const name = (mapping[s.originalSpeaker] || "").trim();
    const absorbed = Array.from(
      absorbedByKey.get(s.originalSpeaker) ?? []
    );
    if (name) {
      const existing = merged.find(
        (m) => m.currentName === name && m.currentName !== ""
      );
      if (existing) {
        existing.originalSpeakers.push(s.originalSpeaker);
        existing.count += s.count;
        existing.globalIndex = Math.min(existing.globalIndex, s.globalIndex);
        for (const k of absorbed) {
          if (!existing.absorbedRawKeys.includes(k))
            existing.absorbedRawKeys.push(k);
        }
        continue;
      }
    }
    merged.push({
      globalIndex: s.globalIndex,
      originalSpeakers: [s.originalSpeaker],
      count: s.count,
      currentName: name,
      absorbedRawKeys: absorbed,
    });
  }
  merged.sort((a, b) => a.globalIndex - b.globalIndex);
  return merged;
}, [segments, mapping]);
```

- [ ] **Step 2: Render the badge in `SpeakerRowView`**

In [SpeakerMappingPanel.tsx](../../src/components/InputSection/SpeakerMappingPanel.tsx), add a helper just above the `SpeakerRowView` component (around line 160):

```ts
function formatAbsorbed(rawKeys: string[]): string {
  const parts = rawKeys.map((k) => {
    const [seq, label] = k.split(":");
    return `청크 ${seq} 화자 ${label}`;
  });
  return `${parts.join(", ")}로부터 자동 병합됨`;
}
```

Then update the `SpeakerRowView` label block (currently around lines 189–196) to:

```tsx
const label =
  row.originalSpeakers.length > 1
    ? `화자 ${row.globalIndex}·병합`
    : `화자 ${row.globalIndex}`;

const autoMergedCount = row.absorbedRawKeys.length;
const absorbedTitle =
  autoMergedCount > 0 ? formatAbsorbed(row.absorbedRawKeys) : undefined;

return (
  <div className={styles.row} role="group" aria-label={`${label}의 실제 이름`}>
    <div className={styles.rowLabel}>
      {label}
      {autoMergedCount > 0 && (
        <span
          className={styles.autoBadge}
          title={absorbedTitle}
          aria-label={`자동 병합 ${autoMergedCount}개. ${absorbedTitle}`}
        >
          자동 병합 {autoMergedCount}개
        </span>
      )}
    </div>
    {/* ... rest unchanged (the select / input + count) ... */}
```

Keep the rest of the row body (the `{mode === "select" ? ... : ...}` block and the `<div className={styles.count}>`) exactly as it was — only the `rowLabel` div and the `return` opening changed.

- [ ] **Step 3: Add the CSS for `autoBadge`**

Edit [src/components/InputSection/SpeakerMappingPanel.module.css](../../src/components/InputSection/SpeakerMappingPanel.module.css). Append:

```css
.autoBadge {
  display: inline-block;
  margin-left: 0.4rem;
  background: #e0e7ff;
  color: #3730a3;
  font-size: 0.7rem;
  font-weight: 500;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  cursor: help;
  vertical-align: middle;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/InputSection/SpeakerMappingPanel.tsx src/components/InputSection/SpeakerMappingPanel.module.css
git commit -m "feat(panel): auto-merge badge with absorbed-keys tooltip"
```

---

## Task 11: Global "자동 병합 전체 취소" button

**Files:**
- Modify: `src/components/InputSection/SpeakerMappingPanel.tsx`
- Modify: `src/components/InputSection/SpeakerMappingPanel.module.css`

- [ ] **Step 1: Declare `suggestionState` (used here and in Task 12)**

In [SpeakerMappingPanel.tsx](../../src/components/InputSection/SpeakerMappingPanel.tsx), add just below the existing `onboardingDismissed` state (around line 35–46):

```ts
const [suggestionState, setSuggestionState] = useState<
  "visible" | "dismissed" | "applied"
>("visible");

// Reset when a new recording starts (segments cleared)
useEffect(() => {
  if (segments.length === 0) setSuggestionState("visible");
}, [segments.length]);
```

- [ ] **Step 2: Compute `hasAutoMerged` and `canShowUndo`**

Just before the `if (segments.length === 0) return null;` early return (around line 82), add:

```ts
const hasAutoMerged = useMemo(
  () =>
    segments.some(
      (s) => s.rawClovaKey && s.rawClovaKey !== s.originalSpeaker
    ),
  [segments]
);

const canShowUndo =
  hasAutoMerged && !isRecording && !isTranscribing && !disabled;
```

- [ ] **Step 3: Render the undo button inside the header**

Locate the header block (around lines 86–104). Replace with:

```tsx
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
  {canShowUndo && (
    <button
      type="button"
      className={styles.undoButton}
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm("모든 자동 병합을 취소하시겠습니까?")) {
          onGlobalUndo();
          setSuggestionState("dismissed");
        }
      }}
      aria-label="자동 병합 전체 취소"
    >
      자동 병합 전체 취소
    </button>
  )}
  <span className={styles.chevron}>{collapsed ? "▾" : "▴"}</span>
</div>
```

- [ ] **Step 4: Add CSS for `undoButton`**

Append to [src/components/InputSection/SpeakerMappingPanel.module.css](../../src/components/InputSection/SpeakerMappingPanel.module.css):

```css
.undoButton {
  background: transparent;
  border: none;
  color: var(--text-secondary, #64748b);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.35rem 0.6rem;
  border-radius: 4px;
  min-height: 32px;
}

.undoButton:hover {
  color: #b91c1c;
  background: #fef2f2;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/InputSection/SpeakerMappingPanel.tsx src/components/InputSection/SpeakerMappingPanel.module.css
git commit -m "feat(panel): add global undo button for auto-merged speakers"
```

---

## Task 12: Excess-speaker suggestion card

**Files:**
- Modify: `src/components/InputSection/SpeakerMappingPanel.tsx`
- Modify: `src/components/InputSection/SpeakerMappingPanel.module.css`

- [ ] **Step 1: Compute proposals and the label map**

In [SpeakerMappingPanel.tsx](../../src/components/InputSection/SpeakerMappingPanel.tsx), under the existing `useMemo` blocks (after `rows`), add:

```ts
const attendeeCount = useMemo(
  () => parseAttendees(attendeesCsv).length,
  [attendeesCsv]
);

const proposals = useMemo(
  () => proposeExcessMerge(segments, attendeeCount),
  [segments, attendeeCount]
);

const showSuggestCard =
  suggestionState === "visible" &&
  !isRecording &&
  !isTranscribing &&
  !disabled &&
  proposals.length > 0;

// Map originalSpeaker key -> "화자 N" label using getSpeakerStats globalIndex
const labelByKey = useMemo(() => {
  const stats = getSpeakerStats(segments);
  const map = new Map<string, string>();
  for (const s of stats) {
    map.set(s.originalSpeaker, `화자 ${s.globalIndex}`);
  }
  return map;
}, [segments]);

// Per-chunk utterance count for proposal display
const countByKey = useMemo(() => {
  const m = new Map<string, number>();
  for (const s of segments) {
    m.set(s.originalSpeaker, (m.get(s.originalSpeaker) ?? 0) + 1);
  }
  return m;
}, [segments]);
```

- [ ] **Step 2: Render the card inside the panel body**

Locate the `{!collapsed && (...)}` body block (around lines 106–147). Insert the card right after the onboarding banner, before the `rows.map(...)`:

```tsx
{showSuggestCard && (
  <div className={styles.suggestCard} role="note">
    <div>
      ⚠ 일부 청크에서 참석자 수({attendeeCount}명)를 초과하는 화자가 감지되었습니다.
      Clova가 동일 인물을 여러 화자로 쪼갠 경우일 수 있습니다.
    </div>
    <ul style={{ margin: "0.5rem 0 0.75rem 1.2rem", padding: 0 }}>
      {proposals.map((p) => {
        const fromLabel = labelByKey.get(p.from) ?? p.from;
        const toLabel = labelByKey.get(p.to) ?? p.to;
        const seq = p.from.split(":")[0];
        const count = countByKey.get(p.from) ?? 0;
        return (
          <li key={`${p.from}->${p.to}`} style={{ margin: "0.15rem 0" }}>
            청크 {seq}: {fromLabel} (발화 {count}회) → {toLabel} (같은 청크)
          </li>
        );
      })}
    </ul>
    <div className={styles.suggestCardActions}>
      <button
        type="button"
        className={styles.suggestApply}
        onClick={() => {
          onApplyExcessMerge(proposals);
          setSuggestionState("applied");
        }}
      >
        자동 병합 적용
      </button>
      <button
        type="button"
        className={styles.suggestDismiss}
        onClick={() => setSuggestionState("dismissed")}
      >
        무시
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add CSS for the card**

Append to [src/components/InputSection/SpeakerMappingPanel.module.css](../../src/components/InputSection/SpeakerMappingPanel.module.css):

```css
.suggestCard {
  background: #fff7ed;
  border-left: 4px solid #f59e0b;
  padding: 0.75rem 0.9rem;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #7c2d12;
}

.suggestCardActions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.suggestApply {
  background: #f59e0b;
  color: #fff;
  border: none;
  padding: 0.5rem 0.8rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  min-height: 36px;
}

.suggestApply:hover {
  background: #d97706;
}

.suggestDismiss {
  background: transparent;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 0.5rem 0.8rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  min-height: 36px;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all pre-existing tests pass, plus 20 new tests in `speakerMerge.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/components/InputSection/SpeakerMappingPanel.tsx src/components/InputSection/SpeakerMappingPanel.module.css
git commit -m "feat(panel): add intra-chunk excess-speaker suggestion card"
```

---

## Task 13: Manual verification

**Files:** none (manual browser testing)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server listens on `http://localhost:3000`.

- [ ] **Step 2: Verify dynamic `speakerCountMax` via file upload**

1. Open `http://localhost:3000`.
2. Fill `참석자` with exactly three comma-separated names (e.g. `A, B, C`).
3. Open the browser devtools → Network tab, set filter to `Fetch/XHR`.
4. Upload a short audio file (< 1 min). Click `회의록 작성하기`.
5. Inspect the `/api/stt` request headers — must include `x-attendee-count: 3`.
6. Inspect the `params` sent to Clova (server-side log will show the `speakerCountMax: 4`).

Expected: header sent, server logs or behavior reflect `speakerCountMax = 4`.

- [ ] **Step 3: Verify the merge badge + tooltip**

1. On the main page, switch to `실시간 녹음`.
2. Record two 2-minute chunks, speaking continuously across the boundary without pausing or ending a sentence (e.g. read a long paragraph).
3. Stop recording and wait for the "변환 완료" state.
4. Expand the `화자 이름 지정` panel.
5. Expect at least one row to show a `자동 병합 N개` badge. Hover the badge — the native tooltip should read `청크 2 화자 1, …로부터 자동 병합됨` (actual keys depend on Clova's output).

Expected: badge renders and tooltip shows raw absorbed keys.

- [ ] **Step 4: Verify global undo**

1. With auto-merged rows visible (from Step 3), click `자동 병합 전체 취소` in the panel header.
2. Confirm the dialog.
3. Expect: the row count increases back to its raw-Clova count (badges disappear; originally-merged rows split back).

Expected: originalSpeaker fully restored from rawClovaKey; no auto-merged badges.

- [ ] **Step 5: Verify excess suggestion card**

1. Fresh recording (new session). Fill `참석자` with 2 names.
2. Record in an environment where Clova is likely to over-split (tone/volume shifts within one 2-minute chunk).
3. After stop, inspect the panel. If any chunk has > 2 distinct speakers, the orange card should appear with per-chunk merge proposals.
4. Click `자동 병합 적용` — the proposed rows collapse into the target rows within their chunk; card disappears.
5. Click `자동 병합 전체 취소` — proposals are reverted to raw Clova keys.

Expected: card only appears after recording fully stops; apply rewrites intra-chunk only; undo restores.

- [ ] **Step 6: Verify no regression on text-only path**

1. Reload the app; choose `직접 입력`.
2. Paste text, generate.
3. Expect: normal flow, no speaker panel, no errors.

Expected: zero regression on the path that bypasses STT.

---

## Self-Review Checklist

- [x] Spec §5 (dynamic `speakerCountMax`) — Tasks 4, 5.
- [x] Spec §6 (auto-merge data model / `rawClovaKey`) — Task 1 adds field; Task 6 populates it.
- [x] Spec §7 (silent boundary merge w/ 500 ms + terminator) — Task 2 (tests + impl), Task 6 (wiring).
- [x] Spec §8 (excess-speaker suggestion, per-chunk algorithm, dominant-speaker regression test) — Task 3 (tests + impl), Task 12 (UI).
- [x] Spec §9 (badge, tooltip, undo button, card styling, wiring) — Tasks 9, 10, 11, 12.
- [x] Spec §10 (out of scope items respected) — no file-upload `segments` rework, no per-row undo, no global cross-chunk identity inference.
- [x] No placeholders ("TBD", "add appropriate handling", etc.).
- [x] Type consistency: `MergeProposal.from`/`to` are strings (namespaced keys); `Segment.rawClovaKey` is `string | undefined`; `onStatusChange` and callbacks have matching signatures across `InputTabs` → `page.tsx` → `SpeakerMappingPanel`.
- [x] `computeBoundaryMerge` and `proposeExcessMerge` are exported from the same module.
- [x] Every code-touching step includes the exact code to write.
- [x] Every test step includes the exact command to run.
