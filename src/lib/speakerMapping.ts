// src/lib/speakerMapping.ts
import type { Segment } from "@/types/meeting";

export type SpeakerStat = {
  originalSpeaker: string;
  count: number;
  globalIndex: number;
};

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
