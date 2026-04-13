// src/lib/speakerMapping.ts
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
