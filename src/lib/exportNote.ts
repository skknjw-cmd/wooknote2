import type { NoteRecord, TurnSegment } from "@/types/meeting";
import { saveAs } from "file-saver";

export interface ExportOptions {
  includeTranscript: boolean;
  includeAiSummary: boolean;
}

// ── 공통 헬퍼 ─────────────────────────────────────────────────────

function participantLabel(note: NoteRecord): string {
  return note.participants.map((p) => p.name || `화자 ${p.sp}`).join(", ") || "미정";
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Markdown ──────────────────────────────────────────────────────

export function exportAsMarkdown(
  note: NoteRecord,
  turns: TurnSegment[],
  opts: ExportOptions,
) {
  const lines: string[] = [];

  lines.push(`# ${note.title}`);
  lines.push(`**회의 일시**: ${note.meetingDate ?? formatDate(note.createdAt)}`);
  if (note.location) lines.push(`**회의 장소**: ${note.location}`);
  const attendeesStr = note.attendees || (note.participants.length > 0 ? participantLabel(note) : "");
  if (attendeesStr) lines.push(`**참석자**: ${attendeesStr}`);
  lines.push("");

  if (opts.includeAiSummary && note.summaryBullets.length > 0) {
    lines.push("## ✦ 핵심 요약");
    note.summaryBullets.forEach((b) => lines.push(`- ${b}`));
    lines.push("");
  }

  if (note.context) {
    lines.push("## 주요 논의 내용");
    lines.push(note.context);
    lines.push("");
  }

  if (note.decisions.length > 0) {
    lines.push("## 결정사항");
    note.decisions.forEach((d) => lines.push(`- ${d}`));
    lines.push("");
  }

  if (note.actions.length > 0) {
    lines.push("## 해야 할 일");
    note.actions.forEach((a) => {
      const check = a.done ? "[x]" : "[ ]";
      const who = a.who ? ` @${a.who}` : "";
      const when = a.when ? ` · ${a.when}` : "";
      lines.push(`- ${check} ${a.what}${who}${when}`);
    });
    lines.push("");
  }

  if (note.questions.length > 0) {
    lines.push("## 미결정사항");
    note.questions.forEach((q) => lines.push(`- ${q}`));
    lines.push("");
  }

  if (note.nextAgenda.length > 0) {
    lines.push("## 향후 일정");
    note.nextAgenda.forEach((a) => lines.push(`- ${a}`));
    lines.push("");
  }

  if (note.memo) {
    lines.push("## 자유 메모");
    lines.push(note.memo);
    lines.push("");
  }

  if (opts.includeTranscript && turns.length > 0) {
    lines.push("---");
    lines.push("## 트랜스크립트");
    turns.forEach((t) => {
      const p = note.participants.find((p) => p.sp === t.sp);
      const name = p?.name || `화자 ${t.sp}`;
      lines.push(`**[${name}]** ${t.text}`);
    });
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `${note.title}.md`);
}

// ── PDF (새 창 + 인쇄) ────────────────────────────────────────────

export function exportAsPDF(
  note: NoteRecord,
  turns: TurnSegment[],
  opts: ExportOptions,
) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("팝업이 차단되어 있습니다. 허용 후 다시 시도해주세요.");
    return;
  }

  const actionRows = note.actions
    .map((a) => {
      const icon = a.done ? "✓" : "○";
      const who = a.who ? `<span class="chip">@${esc(a.who)}</span>` : "";
      const when = a.when ? `<span class="chip">${esc(a.when)}</span>` : "";
      const cls = a.done ? "done" : "";
      return `<li class="${cls}"><span class="cb">${icon}</span><span class="at">${esc(a.what)}</span>${who}${when}</li>`;
    })
    .join("");

  const summaryHTML =
    opts.includeAiSummary && note.summaryBullets.length > 0
      ? `<section class="ai-box"><h2>✦ 핵심 요약</h2><ul>${note.summaryBullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></section>`
      : "";

  const transcriptHTML =
    opts.includeTranscript && turns.length > 0
      ? `<section><h2>트랜스크립트</h2><div class="transcript">${turns
          .map((t) => {
            const p = note.participants.find((p) => p.sp === t.sp);
            return `<p><strong>[${esc(p?.name || `화자 ${t.sp}`)}]</strong> ${esc(t.text)}</p>`;
          })
          .join("")}</div></section>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${esc(note.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;
         max-width: 740px; margin: 0 auto; padding: 48px 32px;
         color: #18181b; font-size: 14px; line-height: 1.7; }
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em; }
  .meta { font-size: 12px; color: #71717a; margin-bottom: 12px; }
  .props { border-collapse: collapse; width: 100%; margin-bottom: 28px; border: 1px solid #ececea; border-radius: 8px; overflow: hidden; font-size: 13px; }
  .props tr { border-bottom: 1px solid #f0f0ee; }
  .props tr:last-child { border-bottom: none; }
  .props td { padding: 6px 12px; }
  .props .pl { color: #71717a; font-weight: 600; font-size: 11.5px; width: 80px; }
  h2 { font-size: 13px; font-weight: 600; margin: 24px 0 8px; }
  section { margin-bottom: 20px; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  li { padding: 2px 0 2px 18px; position: relative; font-size: 13.5px; }
  .d-list li::before { content: '✓'; position: absolute; left: 0;
    color: #16a34a; font-weight: 700; font-size: 11px; }
  .q-list li::before { content: '?'; position: absolute; left: 0;
    color: #71717a; font-weight: 700; font-size: 11px; }
  .a-list li { padding-left: 0; display: flex; align-items: baseline; gap: 8px; }
  .cb { width: 16px; flex-shrink: 0; color: #71717a; font-size: 12px; }
  .at { flex: 1; }
  .done .at { text-decoration: line-through; color: #a1a1aa; }
  .chip { font-size: 11px; background: #f4f4f5; border-radius: 4px;
          padding: 1px 6px; color: #3f3f46; flex-shrink: 0; }
  .ai-box { background: #fafaf9; border: 1px solid #ececea;
            border-radius: 8px; padding: 14px 16px; }
  .ai-box h2 { margin-top: 0; }
  .transcript p { font-size: 13px; margin: 6px 0; }
  @media print { @page { margin: 20mm; } }
</style>
</head>
<body>
<h1>${esc(note.title)}</h1>
${buildMetaRows(note)}
${summaryHTML}
${note.context ? `<section><h2>주요 논의 내용</h2><p>${esc(note.context)}</p></section>` : ""}
${note.decisions.length > 0 ? `<section><h2>결정사항</h2><ul class="d-list">${note.decisions.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></section>` : ""}
${note.actions.length > 0 ? `<section><h2>해야 할 일</h2><ul class="a-list">${actionRows}</ul></section>` : ""}
${note.questions.length > 0 ? `<section><h2>미결정사항</h2><ul class="q-list">${note.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></section>` : ""}
${note.nextAgenda.length > 0 ? `<section><h2>향후 일정</h2><ul>${note.nextAgenda.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></section>` : ""}
${note.memo ? `<section><h2>자유 메모</h2><p>${esc(note.memo)}</p></section>` : ""}
${transcriptHTML}
<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

  w.document.write(html);
  w.document.close();
}

function buildMetaRows(note: NoteRecord): string {
  const date = note.meetingDate ?? new Date(note.createdAt).toLocaleDateString("ko-KR");
  const attendeesStr = note.attendees || (note.participants.length > 0 ? participantLabel(note) : "");
  const rows = [
    `<tr><td class="pl">회의 일시</td><td>${esc(date)}</td></tr>`,
    note.location ? `<tr><td class="pl">회의 장소</td><td>${esc(note.location)}</td></tr>` : "",
    attendeesStr ? `<tr><td class="pl">참석자</td><td>${esc(attendeesStr)}</td></tr>` : "",
  ].filter(Boolean).join("");
  return rows ? `<table class="props">${rows}</table>` : "";
}

// ── Word (.docx) ──────────────────────────────────────────────────

export async function exportAsDocx(
  note: NoteRecord,
  turns: TurnSegment[],
  opts: ExportOptions,
) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  type Para = InstanceType<typeof Paragraph>;
  const children: Para[] = [];

  const p = (text: string) =>
    new Paragraph({ children: [new TextRun({ text, size: 24 })] });
  const h1 = (text: string) =>
    new Paragraph({ text, heading: HeadingLevel.HEADING_1 });
  const h2 = (text: string) =>
    new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
  const bullet = (text: string) =>
    new Paragraph({ children: [new TextRun({ text: `  • ${text}`, size: 24 })] });
  const blank = () => new Paragraph({});

  children.push(h1(note.title));
  children.push(p(`회의 일시: ${note.meetingDate ?? formatDate(note.createdAt)}`));
  if (note.location) children.push(p(`회의 장소: ${note.location}`));
  const attendeesStr = note.attendees || (note.participants.length > 0 ? participantLabel(note) : "");
  if (attendeesStr) children.push(p(`참석자: ${attendeesStr}`));
  children.push(blank());

  if (opts.includeAiSummary && note.summaryBullets.length > 0) {
    children.push(h2("핵심 요약"));
    note.summaryBullets.forEach((b) => children.push(bullet(b)));
    children.push(blank());
  }

  if (note.context) {
    children.push(h2("주요 논의 내용"));
    children.push(p(note.context));
    children.push(blank());
  }

  if (note.decisions.length > 0) {
    children.push(h2("결정사항"));
    note.decisions.forEach((d) => children.push(bullet(`✓ ${d}`)));
    children.push(blank());
  }

  if (note.actions.length > 0) {
    children.push(h2("해야 할 일"));
    note.actions.forEach((a) => {
      const check = a.done ? "[완료] " : "[ ] ";
      const who = a.who ? ` · @${a.who}` : "";
      const when = a.when ? ` · ${a.when}` : "";
      children.push(p(`  ${check}${a.what}${who}${when}`));
    });
    children.push(blank());
  }

  if (note.questions.length > 0) {
    children.push(h2("미결정사항"));
    note.questions.forEach((q) => children.push(bullet(q)));
    children.push(blank());
  }

  if (note.nextAgenda.length > 0) {
    children.push(h2("향후 일정"));
    note.nextAgenda.forEach((a) => children.push(bullet(a)));
    children.push(blank());
  }

  if (note.memo) {
    children.push(h2("자유 메모"));
    children.push(p(note.memo));
    children.push(blank());
  }

  if (opts.includeTranscript && turns.length > 0) {
    children.push(h2("트랜스크립트"));
    turns.forEach((t) => {
      const sp = note.participants.find((p) => p.sp === t.sp);
      const name = sp?.name || `화자 ${t.sp}`;
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${name}] `, bold: true, size: 22 }),
            new TextRun({ text: t.text, size: 22 }),
          ],
        }),
      );
    });
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${note.title}.docx`);
}

// ── 오디오 ────────────────────────────────────────────────────────

export function exportAsAudio(note: NoteRecord) {
  if (!note.audioBlob) {
    alert("이 노트에는 저장된 오디오 파일이 없습니다.");
    return;
  }
  saveAs(note.audioBlob, `${note.title}.m4a`);
}
