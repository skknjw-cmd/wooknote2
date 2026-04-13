// src/lib/speakerMapping.ts
import type { Segment, SpeakerMapping } from "@/types/meeting";

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
