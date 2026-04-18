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

1. Cap Clova's per-call `speakerCountMax` using the meeting's known attendee count (reduces intra-chunk over-split from the engine side).
2. Silently merge the specific case of "a single speaker mechanically cut at a 2-minute boundary" with high-confidence heuristics (short gap + non-terminated utterance).
3. Detect and suggest intra-chunk over-splits — where Clova, within a single API call, rendered one person as multiple speaker labels — and offer a safe within-chunk merge.
4. Preserve Clova's raw labels so the user can undo any automatic merging.

**Explicit non-goal:** globally collapsing the "N chunks × K labels" namespacing into N canonical speakers. Cross-chunk speaker identity cannot be resolved heuristically without voice embeddings; doing so from counts and timing alone creates catastrophic false-merge failures (e.g., a dominant speaker absorbing quieter participants). That reduction is left as a manual UX task.

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
| 2 | Silent chunk-boundary merge (Signal #2) | After each new chunk's STT result; gap < 500 ms AND last utterance non-terminated | Row collapses automatically; badge + tooltip on merged rows |
| 3 | Intra-chunk over-split suggestion card (Signal #1) | After recording stops, for each chunk where detected speakers > attendeeCount | Card at top of `SpeakerMappingPanel` listing per-chunk merge candidates with `[자동 병합 적용]` / `[무시]` |

All three are additive. Each can ship independently but they compose. Note: Signal #1 only ever proposes intra-chunk merges (proposals always have matching `sequenceId` on `from` and `to`); cross-chunk identity is never inferred.

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
   - Let `endsWithTerminator = /[.?!。？！]\s*$/.test(lastSeg.text.trim())` — tests whether the prior speaker's utterance ended with a sentence-terminating punctuation mark (ASCII `.` `?` `!` or CJK fullwidth `。` `？` `！`).
   - **If `gap < 500` ms AND `!endsWithTerminator`:** rewrite every segment in sequenceId N+1 whose `originalSpeaker === firstSeg.originalSpeaker` to have `originalSpeaker = lastSeg.originalSpeaker`. Leave `rawClovaKey` untouched.
4. Chain propagation: the function clones the input array once, then all rewrites happen on the clone. Because subsequent iterations see the already-rewritten `originalSpeaker` when they look up N+1's "last speaker," chains like `1:1` → `2:2` → `3:3` (all gaps < 500 ms, all without terminators) collapse to `1:1` across the whole chain. The input `segments` array is never mutated; the function returns the cloned-and-modified array.

### Threshold & terminator rationale

**500 ms** (was 1500 ms — revised per review). In Korean meetings, turn-taking 맞장구 ("네", "맞아요") can land with gaps as short as 300–800 ms. The purpose of this heuristic is narrower than "detect pauses": it specifically catches "one speaker was mid-utterance when the 2-minute timer mechanically cut the audio." That case produces near-zero gap (just MediaRecorder stop/start overhead plus Clova boundary processing — low hundreds of ms). 500 ms leaves headroom for that overhead while avoiding most genuine speaker handoffs.

**Sentence-terminator check** adds a second safety layer. If `lastSeg.text` ends with `.`, `?`, `!`, `。`, `？`, or `！`, the prior speaker finished a sentence — this is highly unlikely to be a mid-utterance cut. Skip the merge. Caveat: Clova's Korean STT does not always emit punctuation; when absent, this degrades to the timing-only check (which is the conservative direction — we don't add spurious merges, we just miss some legitimate ones, which the user can resolve via manual mapping).

Tunables (named constants in `speakerMerge.ts`):
- `BOUNDARY_MERGE_GAP_MS = 500`
- `SENTENCE_TERMINATORS = /[.?!。？！]\s*$/`

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

1. Two chunks, gap 100 ms, no terminator, different speakers → merge to chunk 1's label.
2. Two chunks, gap 100 ms, `lastSeg.text` ends with `.` → **no merge** (terminator check).
3. Two chunks, gap 100 ms, `lastSeg.text` ends with `?` or `!` → no merge.
4. Two chunks, gap 900 ms, no terminator → no merge (over threshold).
5. Three chunks with chain `1:1` → `2:2 → 1:1` → `3:3 → 1:1` — all gaps < 500 ms and no terminators.
6. `start`/`end` missing in one chunk → pair skipped.
7. Failed chunk (only `${seq}:?` segment) → no merge across that boundary.
8. Same originalSpeaker across boundary → no change.
9. CJK fullwidth terminator (e.g., `다。` or `요？`) → no merge.

---

## 8. Section 4 — Excess-Speaker Suggestion Card (Signal #1)

### Critical scope revision

An earlier draft proposed a **global** Top-N selection (pick the `attendeeCount` most-frequent speakers across all chunks, merge everything else into them). That approach is fundamentally unsafe: in a meeting where one person (chair, presenter) dominates, their per-chunk keys (e.g., `1:1`, `2:1`, `3:1`) can occupy every Top-N slot. Less-frequent speakers (other attendees) get classified as "excess" and merged into the dominant speaker by time-adjacency — turning a multi-person dialogue into a false monologue.

Cross-chunk speaker identity cannot be resolved from utterance counts and timing alone without voice embeddings. Solving the full "45 rows → 3 rows" problem is an ML task out of scope here. This signal's job is narrower: **defend against Clova's within-chunk over-split**, where Clova splits one person into multiple speaker labels within a single API call (typically triggered by tone/volume shifts). That is a localized problem with a safe localized fix.

### New file: `src/lib/speakerMerge.ts` (same file, additional export)

```ts
export type MergeProposal = { from: string; to: string };
export function proposeExcessMerge(
  segments: Segment[],
  attendeeCount: number
): MergeProposal[];
```

### Algorithm (per-chunk local merge)

1. If `attendeeCount <= 0` → return `[]`.
2. Group `segments` by `sequenceId` (i.e., one bucket per Clova API call).
3. For each chunk bucket:
   a. Compute `speakersInChunk` = distinct `originalSpeaker` values in this chunk, each with its utterance count (within this chunk only) and time-sorted segment list.
   b. If `speakersInChunk.length <= attendeeCount` → skip this chunk (no over-split to defend against).
   c. Sort `speakersInChunk` by utterance count desc (within-chunk count, **not** global).
      - `chunkMajor` = top `attendeeCount` speakers in this chunk.
      - `chunkExcess` = remaining speakers in this chunk.
   d. For each `E` in `chunkExcess`:
      - For each segment `s` in `E`, find the nearest segment (by `|s.start - s'.start|`) among `chunkMajor` speakers **within this same chunk**.
      - Aggregate by candidate major `M`: sum of per-segment min distance to any `M` segment.
      - Pick the `M` with the smallest aggregate distance.
      - Tie-breaker: higher within-chunk utterance count wins.
      - Append `{ from: E.originalSpeaker, to: chosenM.originalSpeaker }`.
      - If `E` has any segment lacking `start` → fall back to the most-frequent chunk-major as target for the whole of `E`.
4. Return the aggregated proposal array across all chunks.

### Safety invariants

- **All proposals are intra-chunk**: `from` and `to` always share the same `sequenceId` prefix. A proposal like `{from: "3:4", to: "1:1"}` is structurally impossible from this algorithm.
- **Dominant-speaker trap is eliminated**: each chunk evaluates its own Top-N in isolation, so person A dominating globally does not push person B into the excess bucket in chunks where B spoke.
- **Worst-case outcome** when the heuristic is still wrong: a Clova over-split that was NOT fixed, or (rare) an intra-chunk misrouting within a single 2-min window. The user sees the card, can ignore it, and the underlying data is unchanged. Applied merges are reversible via global undo.

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

Content (per-chunk framing reflects the revised algorithm):

```
⚠  일부 청크에서 참석자 수(N명)를 초과하는 화자가 감지되었습니다.
   Clova가 동일 인물을 여러 화자로 쪼갠 경우일 수 있습니다.

   청크별 병합 후보 (K건):
     • 청크 2: 화자 4 (발화 1회) → 화자 2 (같은 청크)
     • 청크 3: 화자 5 (발화 2회) → 화자 1 (같은 청크)
     ...
   [ 자동 병합 적용 ]   [ 무시 ]
```

Display labels use `SpeakerRow.globalIndex` mapping (via `getSpeakerStats`), so raw `from`/`to` keys are rendered as human-friendly "화자 N" labels. The "청크 N" prefix comes from the `sequenceId` embedded in each proposal's `from` key.

### Actions

- **자동 병합 적용**: `SpeakerMappingPanel` invokes `onApplyExcessMerge(proposals)` prop. `page.tsx` rewrites `inputData.segments` — for each `{from, to}`, set `segment.originalSpeaker = to` on every segment whose current `originalSpeaker === from`. `rawClovaKey` stays untouched (so global undo still works). Panel then sets `suggestionState = 'applied'`.
- **무시**: `suggestionState = 'dismissed'`. Card hidden for this session. Even if new chunks arrive and push over threshold again, stays hidden.

### State lifetime

- State lives in `SpeakerMappingPanel`. Resets when `segments.length === 0` (new recording starts).
- Not persisted to storage.

### Testing

Add to `src/lib/speakerMerge.test.ts`:

1. `attendeeCount = 0` → empty proposals.
2. Every chunk has ≤ attendeeCount distinct speakers → empty (no over-split anywhere).
3. One chunk with 4 speakers, attendeeCount 2 → 2 proposals, both with matching `sequenceId` on `from` and `to` (intra-chunk safety invariant).
4. Two chunks each over-split → proposals from both, each staying intra-chunk.
5. Dominant-speaker scenario (the original failure mode): person A has keys `1:1`, `2:1`, `3:1` (dominant globally), person B has `1:2`, `2:2`, `3:2`; each chunk has exactly 2 distinct speakers and `attendeeCount = 2` → **no proposals** (regression guard against the global-top-N trap).
6. Chunk excess with full timing → adjacency wins over frequency (chose closer-in-time major even if less frequent).
7. Chunk excess with all timing missing → falls back to highest-frequency chunk-major.
8. Tie on distance → higher within-chunk utterance count wins.

---

## 9. Section 5 — UI (Badge, Undo, Visual Hierarchy)

### Merged-row badge

In `SpeakerRowView` ([SpeakerMappingPanel.tsx:160–251](../../src/components/InputSection/SpeakerMappingPanel.tsx#L160-L251)):

- For each row, collect the set `absorbedKeys` = distinct `rawClovaKey` values among this row's segments where `rawClovaKey && rawClovaKey !== originalSpeaker`. Let `autoMergedCount = absorbedKeys.size`.
  - This filter intentionally distinguishes auto-merge (`originalSpeaker` was rewritten) from user-driven merges (user mapped two different `originalSpeaker` keys to the same display name — those rows keep `rawClovaKey === originalSpeaker` and should not show the badge).
- If `autoMergedCount > 0`: render a small badge next to the label: `[자동 병합 N개]`.
- **Hover tooltip** on the badge (native `title` attribute): format `absorbedKeys` as human-readable labels separated by `, `. Each raw key `"${seq}:${label}"` renders as `"청크 ${seq} 화자 ${label}"`. Example: `title="청크 2 화자 3, 청크 3 화자 1로부터 자동 병합됨"`. This lets the user judge the merge's plausibility before deciding whether to keep or undo.
- Style: `background: #e0e7ff; color: #3730a3; font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 4px; cursor: help;`.
- `aria-label="자동 병합 N개. 청크 2 화자 3, 청크 3 화자 1로부터 병합됨"` (same content as tooltip, for screen readers).

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
| 500 ms threshold still too aggressive → merges genuine rapid-turn handoffs at chunk boundaries | Sentence-terminator check provides a second gate. Global undo restores raw state for the whole session. Threshold is a single tunable constant for field adjustment. |
| Clova emits no punctuation on Korean speech → terminator check becomes a no-op | Degrades to timing-only check at 500 ms, which is already conservative. Failure mode is benign (missed merges, not wrong merges). |
| `speakerCountMax = attendees + 1` too tight, forcing Clova to collapse real distinct speakers | "+1" buffer, and `speakerCountMin: 1` prevents under-detection. If attendees empty, falls back to `10`. |
| Suggestion card routes the wrong intra-chunk speaker into a major | Intra-chunk scope caps blast radius to a single 2-min window. User can ignore the card, or apply and then undo globally. |
| Storage backward compatibility | `rawClovaKey` is optional → old v2 meetings load fine; auto-merge simply doesn't show badges / undo affordance for them. |

## 12. Success Criteria

- Users with attendees CSV filled see fewer over-counted speakers per chunk (effect of Section 1 tightening Clova's `speakerCountMax`).
- When a speaker's utterance is mechanically cut at a 2-min chunk boundary, the resulting two rows collapse automatically in the common case (effect of Section 3, gap < 500 ms + non-terminated).
- When Clova over-splits a single person within one chunk, the user is notified and can apply a safe intra-chunk merge with one click (effect of Section 4).
- No proposal generated by Section 4 ever crosses chunk boundaries (safety invariant — enforced in tests).
- When any auto-merge misfires, user can fully recover via one click + confirm, and each merged row exposes a tooltip showing exactly which raw keys were absorbed.
- Zero regression in file-upload and direct-text paths.

Explicit non-criterion: the UI may still show many rows for long meetings (one set per chunk). This is expected — cross-chunk identity is left to the user. The improvement is correctness and transparency of the merges that are made, not volume reduction.
