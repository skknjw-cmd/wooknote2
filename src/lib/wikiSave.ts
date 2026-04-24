import type { SavedMeetingResultV2, AnalysisSection } from "@/types/meeting";

export function generateFileName(title: string, date: string): string {
  const safeName = (title || "회의록").replace(/[/\\:*?"<>|]/g, "_").trim();
  return `${date}_${safeName}.md`;
}

export function generateMeetingMd(saved: SavedMeetingResultV2): string {
  const { analysis, meetingInfo } = saved;

  const attendees =
    analysis.attendees.length > 0
      ? analysis.attendees
      : meetingInfo.attendees
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  const lines: string[] = ["---"];
  lines.push(`title: ${analysis.title || meetingInfo.title || "회의록"}`);
  lines.push(`date: ${analysis.date || meetingInfo.date}`);
  if (meetingInfo.location) lines.push(`location: ${meetingInfo.location}`);
  if (attendees.length > 0) {
    lines.push("attendees:");
    for (const a of attendees) lines.push(`  - ${a}`);
  }
  lines.push("tags:");
  lines.push("  - 회의록");
  lines.push("---");
  lines.push("");

  for (const sec of analysis.sections) {
    lines.push(...renderSection(sec));
    lines.push("");
  }

  return lines.join("\n");
}

function renderSection(sec: AnalysisSection): string[] {
  const out: string[] = [`## ${sec.name}`];

  if (sec.type === "table" && Array.isArray(sec.content)) {
    out.push("| 과제 | 담당자 | 기한 | 우선순위 | 비고 |");
    out.push("|------|--------|------|---------|------|");
    for (const row of sec.content) {
      const cells = [row.task, row.owner, row.due, row.prio, row.notes].map((v) =>
        String(v ?? "").replace(/\|/g, "\\|")
      );
      out.push(`| ${cells.join(" | ")} |`);
    }
  } else if (sec.type === "numbered" && Array.isArray(sec.content)) {
    sec.content.forEach((item, i) => {
      const idx = String(i + 1).padStart(2, "0");
      out.push(`${idx}. **${item.title}**`);
      if (item.description) out.push(`    ${item.description}`);
    });
  }

  return out;
}
