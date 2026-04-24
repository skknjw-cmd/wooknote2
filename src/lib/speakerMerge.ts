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

/**
 * Applies a list of MergeProposals to segments by renaming originalSpeaker.
 * Pure: never mutates the input.
 */
export function applyMergeProposals(
  segments: Segment[],
  proposals: MergeProposal[]
): Segment[] {
  if (proposals.length === 0) return segments.slice();
  const rename = new Map(proposals.map((p) => [p.from, p.to]));
  return segments.map((s) => {
    const to = rename.get(s.originalSpeaker);
    return to ? { ...s, originalSpeaker: to } : { ...s };
  });
}

/**
 * Cross-chunk speaker matching by first-appearance order.
 *
 * For each consecutive chunk pair (N → N+1), maps chunk N+1's j-th speaker
 * (by earliest start time) to chunk N's j-th speaker. Renames originalSpeaker
 * only — rawClovaKey is never touched, preserving undo capability.
 *
 * Chains correctly: after N→N+1 merge, chunk N+1 carries chunk N's keys,
 * which become the reference when processing N+1→N+2.
 *
 * Pure: never mutates the input.
 */
export function computeCrossChunkMerge(segments: Segment[]): Segment[] {
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

    const nOrder = getSpeakersOrderedByEarliestStart(chunkN);
    const mOrder = getSpeakersOrderedByEarliestStart(chunkM);

    const limit = Math.min(nOrder.length, mOrder.length);
    for (let j = 0; j < limit; j++) {
      const fromKey = mOrder[j];
      const toKey = nOrder[j];
      if (fromKey === toKey) continue;
      for (const s of chunkM) {
        if (s.originalSpeaker === fromKey) s.originalSpeaker = toKey;
      }
    }
  }

  return out;
}

function getSpeakersOrderedByEarliestStart(segs: Segment[]): string[] {
  const earliest = new Map<string, number>();
  for (const s of segs) {
    if (typeof s.start !== "number") continue;
    const prev = earliest.get(s.originalSpeaker);
    if (prev === undefined || s.start < prev) earliest.set(s.originalSpeaker, s.start);
  }
  return Array.from(earliest.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
}
