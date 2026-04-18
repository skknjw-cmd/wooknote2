# Speaker Diarization Improvements — Design

**Date:** 2026-04-18
**Status:** Approved (awaiting implementation plan)
**Scope:** Reduce the number of speaker rows users must manually map after Clova Speech diarization, by (1) constraining Clova's per-call speaker ceiling using known attendee count, and (2) auto/suggested merging of over-split speakers across 2-minute chunk boundaries.

---

## 1. Problem

Clova Speech returns speaker labels that are **only meaningful within a single API call**. The current recording pipeline splits audio into 2-minute chunks and calls `/api/stt` once per chunk ([InputTabs.tsx:6](../../src/components/InputSection/InputTabs.tsx#L6)), then namespaces each chunk's labels as `${sequenceId}:${clovaLabel}` ([InputTabs.tsx:156](../../src/components/InputSection/InputTabs.tsx#L156)). Consequences:

- A 30-min meeting with 3 real speakers can yield **up to 45 distinct namespaced keys** (15 chunks × 3 labels).
- Each key becomes a row in [SpeakerMappingPanel](../../src/components/InputSection/SpeakerMappingPanel.tsx) that the user must map by hand.
- Secondary amplifier: `speakerCountMax: 10` ([stt/route.ts:49](../../src/app/api/stt/route.ts#L49)) lets Clova over-split even within a single chunk.

Root cause attribution (evidence-based, from code review):
- ~70% — our chunk-based namespacing architecture
- ~15% — Clova's generous `speakerCountMax`
- ~15% — Clova's in-call diarization genuinely splitting one person (tone/volume shifts)

## 2. Goals

1. Cap Clova's per-call `speakerCountMax` using the meeting's known attendee count.
2. Silently merge speakers across chunk boundaries when continuity is high-confidence.
3. Suggest (not silently apply) merges when total speaker count clearly exceeds attendee count.
4. Preserve Clova's raw labels so the user can undo any automatic merging.

## 3. Non-Goals

- Voice-embedding-based speaker identification (out of scope — requires additional ML service).
- Applying merge logic to the **file upload** path. File upload currently discards `segments` and only keeps flat text ([page.tsx:140–150](../../src/app/page.tsx#L140-L150)); reworking that path is a separate effort.
- Per-row (granular) undo of automatic merges. A single global undo is sufficient for MVP.
- Per-suggestion selective accept (e.g., "merge speaker 4 but not 5"). Suggestion card is all-or-nothing.

---

## 4. Solution Overview

Three independent improvements, layered:

| # | Improvement | Trigger | UX |
|---|---|---|---|
| 1 | Dynamic `speakerCountMax` | Every `/api/stt` call | Invisible |
| 2 | Silent chunk-boundary merge (Signal #2) | After each new chunk's STT result | Row collapses automatically; badge on merged rows |
| 3 | Excess-speaker suggestion card (Signal #1) | After recording stops, if detected > attendees+1 | Card at top of `SpeakerMappingPanel` with `[자동 병합 적용]` / `[무시]` |

All three are additive. Each can ship independently but they compose.

---

## 5. Section 1 — Dynamic `speakerCountMax`

### Data flow

1. Client parses `meetingInfo.attendees` CSV via `parseAttendees()` to get integer count.
2. Client adds `x-attendee-count` header on every `/api/stt` call.
3. Server reads the header and sets `speakerCountMax` accordingly.

### Server change ([src/app/api/stt/route.ts](../../src/app/api/stt/route.ts))

Replace the hard-coded `diarization` block:

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
  diarization: { enable: true, speakerCountMin: 1, speakerCountMax },
};
```

- `speakerCountMin: 1` kept — real speakers may be fewer than attendees (late arrivals, silent observers).
- Empty / invalid header → fallback `10` (preserves current behavior for users who don't fill attendees).

### Client changes

- **`InputTabs`** ([src/components/InputSection/InputTabs.tsx](../../src/components/InputSection/InputTabs.tsx)): add prop `attendeesCsv: string`; `getClovaHeaders()` appends `x-attendee-count: ${parseAttendees(attendeesCsv).length}`.
- **`page.tsx`** ([src/app/page.tsx](../../src/app/page.tsx)):
  - Pass `attendeesCsv={meetingInfo.attendees}` to `<InputTabs>`.
  - File-upload fetch ([page.tsx:140–148](../../src/app/page.tsx#L140-L148)) also includes the same header.

### Applies to both

Recording chunks **and** file upload. The header piggybacks on existing custom-header pattern (`x-clova-url`, `x-clova-key`).

---

## 6. Section 2 — Auto-Merge Data Model

### Segment type extension

`src/types/meeting.ts`:

```ts
export type Segment = {
  id: string;
  sequenceId: number;
  originalSpeaker: string;   // NOW: group key (may be rewritten by auto-merge)
  rawClovaKey?: string;      // NEW: immutable raw "${sequenceId}:${clovaLabel}"
  text: string;
  start?: number;
  end?: number;
  speakerOverride?: string;
};
```

### Invariants

- **On initial segment creation** (in `processSegment`): `rawClovaKey = originalSpeaker` (both set to `${sequenceId}:${clovaLabel}`).
- **After auto-merge**: `originalSpeaker` may be rewritten to the canonical key; `rawClovaKey` stays frozen.
- **Consumers** (`getSpeakerStats`, `SpeakerMappingPanel`, `resolveSegments`, `applyMappingToAnalysis`) continue to read `originalSpeaker` unchanged — grouping naturally reflects the merged view.

### Why this model

Chosen over alternatives:

| Alternative | Reason rejected |
|---|---|
| New `canonicalSpeaker` field, all consumers read it | Requires touching every grouping site in [speakerMapping.ts](../../src/lib/speakerMapping.ts), `SpeakerMappingPanel`, `TranscriptEditor`, etc. Invasive. |
| Separate `autoMergeMap: Record<string,string>` dict | Every grouping site needs lookup injection; storage migration complicated. |
| **Chosen: mutate `originalSpeaker`, preserve raw in `rawClovaKey`** | Zero consumer changes. Optional new field → backward-compatible storage. |

### Storage

`rawClovaKey` is optional → existing v1→v2 migration in [meetingStorage.ts](../../src/lib/meetingStorage.ts) unaffected. Old saved meetings without the field behave as if no auto-merge occurred (safe degradation).

### Undo contract

Global undo restores `originalSpeaker ← rawClovaKey ?? originalSpeaker` for every segment. Undo is only exposed when recording has fully stopped and no STT calls are in flight (`!isRecording && !isTranscribing`) — no race with trailing-chunk re-emits, no session flag needed.

---

## 7. Section 3 — Silent Chunk-Boundary Merge (Signal #2)

### New file: `src/lib/speakerMerge.ts`

Exports a pure function:

```ts
export function computeBoundaryMerge(segments: Segment[]): Segment[];
```

### Algorithm

1. Group segments by `sequenceId`.
2. Walk adjacent pairs `(N, N+1)` in ascending sequenceId order.
3. For each pair:
   - `lastSeg` = segment with max `start` in sequenceId N.
   - `firstSeg` = segment with min `start` in sequenceId N+1.
   - Skip if either missing `start` or `end`, or if they share `originalSpeaker`.
   - Compute `gap = firstSeg.start - lastSeg.end`.
   - **If `gap < 1500` ms:** rewrite every segment in sequenceId N+1 whose `originalSpeaker === firstSeg.originalSpeaker` to have `originalSpeaker = lastSeg.originalSpeaker`. Leave `rawClovaKey` untouched.
4. Chain propagation: the function clones the input array once, then all rewrites happen on the clone. Because subsequent iterations see the already-rewritten `originalSpeaker` when they look up N+1's "last speaker," chains like `1:1` → `2:2` → `3:3` (all gaps < 1500 ms) collapse to `1:1` across the whole chain. The input `segments` array is never mutated; the function returns the cloned-and-modified array.

### Threshold rationale

**1500 ms.** MediaRecorder stop/start gap is tens of ms; Clova processes each file independently, so boundary effects add a few hundred ms. A real speaker turn-taking pause is usually ≥ 1.5 s in Korean meeting contexts. Tunable constant (name: `BOUNDARY_MERGE_GAP_MS`) so we can adjust from field data.

### Invocation point

Called inside `emitAllSegments` in [InputTabs.tsx:83–93](../../src/components/InputSection/InputTabs.tsx#L83-L93). The output replaces the flat segment array before passing to `resolveSegments` and `onChangeRef.current`.

No session gate — `computeBoundaryMerge` runs on every emit. Since it only rewrites `originalSpeaker` when `rawClovaKey !== originalSpeaker` would still differ, and since global undo (see §9) is gated on `!isRecording && !isTranscribing` (i.e., no more emits possible after undo runs), the merge is idempotent and safe to run unconditionally.

### Edge cases

| Case | Behavior |
|---|---|
| Single chunk | Loop body never runs; returns input unchanged. |
| Chunk with STT failure (originalSpeaker ends in `:?`) | lastSeg/firstSeg lookup still works; skip is determined by missing start/end. Effectively no merge across a failed chunk. |
| `start`/`end` missing | Skip that pair (conservative). |
| Already merged keys | Idempotent — rewriting `"2:1"` to `"1:1"` when it's already `"1:1"` is a no-op. |
| User's manual `speakerOverride` on a segment | Untouched by auto-merge (we only touch `originalSpeaker`). |

### Testing ([speakerMapping.test.ts](../../src/lib/speakerMapping.test.ts) as reference)

Add `src/lib/speakerMerge.test.ts` with cases:

1. Two chunks, gap 500 ms, different speakers → merge to chunk 1's label.
2. Two chunks, gap 2000 ms → no merge.
3. Three chunks with chain `1:1` | `2:2 → 1:1` | `3:3 → 1:1` — all gaps small.
4. `start`/`end` missing in one chunk → pair skipped.
5. Failed chunk (only `${seq}:?` segment) → no merge across that boundary.
6. Same originalSpeaker across boundary → no change.

---

## 8. Section 4 — Excess-Speaker Suggestion Card (Signal #1)

### New file: `src/lib/speakerMerge.ts` (same file, additional export)

```ts
export type MergeProposal = { from: string; to: string };
export function proposeExcessMerge(
  segments: Segment[],
  attendeeCount: number
): MergeProposal[];
```

### Algorithm

1. If `attendeeCount <= 0` → return `[]`.
2. Compute per-`originalSpeaker` stats: utterance count + time-sorted segment list.
3. If total distinct speakers ≤ `attendeeCount` → return `[]`.
4. Sort speakers by utterance count desc:
   - `major` = top `attendeeCount`
   - `excess` = the rest
5. For each `E` in `excess`:
   - For each segment `s` in `E`, find the nearest `major` segment in time: `min over m in major of min over s' in m of |s.start - s'.start|`.
   - Aggregate by `major`: sum of per-segment "minimum distance to *this* major speaker".
   - Pick the `major` with the smallest aggregate distance.
   - Tie-breaker: higher utterance count wins.
   - Append `{ from: E.key, to: chosenMajor.key }`.
6. If any excess segment lacks `start` → fall back to most-frequent major as target for that entire `E`.
7. Return array.

### Invocation

Computed in `SpeakerMappingPanel` via `useMemo` on `segments + attendeeCount`. Cheap enough for every render (O(n·m) where n = excess segments, m = major speakers; meeting-scale numbers are small).

### Display gate

Card shows iff **all** hold:

- `!isRecording && !isTranscribing` — recording fully stopped, no pending STT calls (avoids card flashing as trailing chunks still arrive).
- `proposeExcessMerge(...).length > 0`.
- Panel state `suggestionState === 'visible'` (not `'dismissed'` / `'applied'`).

Source of `isRecording` / `isTranscribing`: `InputTabs` already owns both; add a single `onStatusChange?: (s: { isRecording: boolean; isTranscribing: boolean }) => void` callback prop. `page.tsx` holds the mirrored state and forwards the flags to `SpeakerMappingPanel`.

### Card UI (inside `SpeakerMappingPanel` body)

Placement: after the onboarding banner, before the first speaker row.

Content:

```
⚠  감지된 화자가 참석자 수(N명)를 초과합니다 (M명 감지)
   다음 K명은 주요 화자의 오분리일 가능성이 높습니다:
     • 화자 4 (발화 2회) → 화자 1로 병합
     • 화자 5 (발화 1회) → 화자 2로 병합
     ...
   [ 자동 병합 적용 ]   [ 무시 ]
```

Display labels use `SpeakerRow.globalIndex` mapping (via `getSpeakerStats`), not raw keys.

### Actions

- **자동 병합 적용**: `SpeakerMappingPanel` invokes `onApplyExcessMerge(proposals)` prop. `page.tsx` rewrites `inputData.segments` — for each `{from, to}`, set `segment.originalSpeaker = to` on every segment whose current `originalSpeaker === from`. `rawClovaKey` stays untouched (so global undo still works). Panel then sets `suggestionState = 'applied'`.
- **무시**: `suggestionState = 'dismissed'`. Card hidden for this session. Even if new chunks arrive and push over threshold again, stays hidden.

### State lifetime

- State lives in `SpeakerMappingPanel`. Resets when `segments.length === 0` (new recording starts).
- Not persisted to storage.

### Testing

Add to `src/lib/speakerMerge.test.ts`:

1. `attendeeCount = 0` → empty proposals.
2. Speakers ≤ attendeeCount → empty.
3. 5 speakers, attendeeCount 3 → 2 proposals, targeting nearest-in-time major.
4. Excess with all timing present → adjacency wins over frequency.
5. Excess with no timing → falls back to top-frequency major.
6. Tie on distance → higher-frequency major wins.

---

## 9. Section 5 — UI (Badge, Undo, Visual Hierarchy)

### Merged-row badge

In `SpeakerRowView` ([SpeakerMappingPanel.tsx:160–251](../../src/components/InputSection/SpeakerMappingPanel.tsx#L160-L251)):

- For each row, count distinct `rawClovaKey` values among segments where `rawClovaKey && rawClovaKey !== originalSpeaker`. Call this `autoMergedCount`.
  - This filter intentionally distinguishes auto-merge (`originalSpeaker` was rewritten) from user-driven merges (user mapped two different `originalSpeaker` keys to the same display name — those rows keep `rawClovaKey === originalSpeaker` and should not show the badge).
- If `autoMergedCount > 0`: render a small badge next to the label: `[자동 병합 N개]`.
- Style: `background: #e0e7ff; color: #3730a3; font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 4px;`.
- `aria-label="자동 병합 N개"`.

Compute inside the existing `rows` `useMemo` in `SpeakerMappingPanel`. The panel already receives `segments` so no new prop is needed for this.

### Panel header action: "자동 병합 전체 취소"

Placement: right side of the collapsed/expanded header ([SpeakerMappingPanel.tsx:86–104](../../src/components/InputSection/SpeakerMappingPanel.tsx#L86-L104)), before the chevron.

Display rule: **all** of
- `!isRecording && !isTranscribing` (no race with trailing emits).
- At least one segment has `rawClovaKey && rawClovaKey !== originalSpeaker`.

Action: `window.confirm("모든 자동 병합을 취소하시겠습니까?")` → on confirm, parent callback sets `segment.originalSpeaker = segment.rawClovaKey` for every affected segment and dismisses the suggestion card (`suggestionState = 'dismissed'`). No session flag needed since `computeBoundaryMerge` does not run after recording stops.

Styling: text button, `color: var(--text-secondary)`, hover `color: var(--danger, #b91c1c)`.

Event propagation: `e.stopPropagation()` so clicking the button doesn't toggle panel collapse.

### Suggestion card styling

Reuse `styles.banner` pattern (currently used for onboarding banner, [SpeakerMappingPanel.module.css]):
- Warn variant: orange/amber tint (`background: #fff7ed; border-left: 4px solid #f59e0b; color: #7c2d12`).
- Add new CSS class `styles.suggestCard` in the same module.

### Wiring (state owner)

Segments are owned in `InputTabs` (`segmentsMapRef` + `emitAllSegments`) and flow up to `page.tsx` as `inputData.segments`. Auto-merge mutations happen in two places:

- **Silent (during recording):** inside `InputTabs.emitAllSegments`, which always runs `computeBoundaryMerge` before emitting.
- **After recording stops:** excess-card apply and global undo. Both rewrite `inputData.segments` directly in `page.tsx` state — safe because no further emits come from `InputTabs` once `!isRecording && !isTranscribing`.

Minimal additions:

- **`InputTabs`**:
  - New prop: `onStatusChange?: (s: { isRecording: boolean; isTranscribing: boolean }) => void`. Fire from effects whenever either flag changes.
  - `emitAllSegments` wraps the segment list with `computeBoundaryMerge(...)` before calling `onChangeRef.current`.
  - On initial segment creation (inside `processSegment`), set `rawClovaKey = originalSpeaker`.
- **`page.tsx`**:
  - New state: `recorderStatus: { isRecording: boolean; isTranscribing: boolean }`. Updated by `InputTabs.onStatusChange`.
  - New callback `handleApplyExcessMerge(proposals)`: rewrite `inputData.segments` by mapping each `from` key's segments to the `to` key. Called by `SpeakerMappingPanel` when the user clicks "자동 병합 적용".
  - New callback `handleGlobalUndo()`: rewrite `inputData.segments` setting `originalSpeaker = rawClovaKey` for every segment. Called by `SpeakerMappingPanel` header button.
- **`SpeakerMappingPanel`**:
  - New props: `isRecording: boolean`, `isTranscribing: boolean`, `onApplyExcessMerge(proposals): void`, `onGlobalUndo(): void`.
  - Gate card display and undo button on `!isRecording && !isTranscribing`.

---

## 10. Out of Scope (Deferred)

- Voice-embedding-based cross-chunk identification.
- Extending auto-merge logic to the file-upload path (requires refactoring the file-upload flow to preserve segments, which is substantial).
- Per-row (granular) undo of auto-merge.
- Per-proposal selective accept in the suggestion card.
- Re-computing proposals after partial merges (card is one-shot).
- Surfacing auto-merge status in `TranscriptEditor` result view (`rawClovaKey` survives to storage, so a future iteration could reuse it there).

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| 1500 ms threshold too aggressive → wrongly merges genuine speaker handoffs at boundaries | Global undo restores raw state. Threshold is a single tunable constant — easy to tighten to 500 ms if field data shows false merges. |
| Threshold too conservative → doesn't catch real continuities | Excess-speaker suggestion card catches the residual case. |
| `speakerCountMax = attendees + 1` too tight, forcing Clova to collapse real distinct speakers | "+1" buffer, and `speakerCountMin: 1` prevents under-detection. If attendees empty, falls back to `10`. |
| Suggestion card's nearest-in-time heuristic misroutes excess speakers | User can ignore the card (manual mapping still works); worst case = no change. |
| Storage backward compatibility | `rawClovaKey` is optional → old v2 meetings load fine; auto-merge simply doesn't show badges / undo affordance for them. |

## 12. Success Criteria

- A 30-minute recording with 3 real speakers yields ≤ ~8 rows (down from up to 45) in `SpeakerMappingPanel` before the user maps anything.
- Users with attendees CSV filled experience fewer over-counted speakers in a single chunk (effect of Section 1).
- When auto-merge misfires, user can fully recover via one click + confirm.
- Zero regression in file-upload and direct-text paths.
