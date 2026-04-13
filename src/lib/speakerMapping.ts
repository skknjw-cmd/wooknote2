// src/lib/speakerMapping.ts
import type { AnalysisResult, Segment, SpeakerMapping } from "@/types/meeting";

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
  const pattern =
    `(?<=^|[\\s.,!?:;「『"'(\\[])` +
    escaped +
    `(?=$|[\\s.,!?:;「』"')\\]]|[${PARTICLES}])`;
  return new RegExp(pattern, "g");
}

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

  renames.sort((a, b) => b.oldName.length - a.oldName.length);

  const unresolvedNames: string[] = [];
  const safeRenames: Array<{ oldName: string; newName: string; re: RegExp }> = [];
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
