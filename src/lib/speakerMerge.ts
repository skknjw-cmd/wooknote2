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
