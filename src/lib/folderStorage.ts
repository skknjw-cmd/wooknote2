import type { NoteRecord } from "@/types/meeting";
import { saveSetting, getSetting } from "@/lib/db";

const FOLDER_KEY = "saveFolderHandle";

export function isFolderPickerSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickSaveFolder(): Promise<string | null> {
  if (!isFolderPickerSupported()) return null;
  try {
    const handle = await (window as unknown as { showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker({ mode: "readwrite" });
    await saveSetting(FOLDER_KEY, handle);
    return handle.name;
  } catch {
    return null; // 사용자가 취소한 경우
  }
}

export async function getSaveFolderName(): Promise<string | null> {
  if (!isFolderPickerSupported()) return null;
  try {
    const handle = await getSetting<FileSystemDirectoryHandle>(FOLDER_KEY);
    if (!handle) return null;
    const perm = await (handle as unknown as { requestPermission: (opts: { mode: string }) => Promise<string> }).requestPermission({ mode: "readwrite" });
    if (perm !== "granted") return null;
    return handle.name;
  } catch {
    return null;
  }
}

function sanitizeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 50) || "제목없음";
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function noteToMarkdown(note: NoteRecord): string {
  const lines: string[] = [];
  const attendeesStr = note.attendees ||
    (note.participants.length > 0
      ? note.participants.map((p) => p.name || `화자 ${p.sp}`).join(", ")
      : "");

  lines.push(`# ${note.title}`);
  lines.push(`**날짜**: ${note.meetingDate ?? formatDate(note.createdAt)}`);
  if (note.location) lines.push(`**장소**: ${note.location}`);
  if (attendeesStr) lines.push(`**참석자**: ${attendeesStr}`);
  lines.push("");

  if (note.summaryBullets.length > 0) {
    lines.push("## ✦ 핵심 요약");
    note.summaryBullets.forEach((b) => lines.push(`- ${b}`));
    lines.push("");
  }

  // discussions가 있으면 구조화된 형태로, 없으면 context 평문 그대로
  const discussions = note.discussions;
  if (discussions && discussions.length > 0) {
    lines.push("## 주요 논의 내용");
    lines.push("");
    discussions.forEach((item, i) => {
      if (i > 0) lines.push("");
      if (item.title) lines.push(`### ${item.title}`);
      if (item.background) lines.push(`**배경** ${item.background}`);
      if (item.discussion) lines.push(`**논의** ${item.discussion}`);
      if (item.conclusion) lines.push(`**결론** ${item.conclusion}`);
    });
    lines.push("");
  } else if (note.context) {
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
    lines.push("## 실행 과제");
    lines.push("| 과제 | 담당자 | 기한 | 완료기준 |");
    lines.push("|------|--------|------|---------|");
    note.actions.forEach((a) => {
      lines.push(`| ${a.what} | ${a.who || "미정"} | ${a.when || "미정"} | ${a.notes || ""} |`);
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

  if (note.segments.length > 0) {
    lines.push("---");
    lines.push("## 트랜스크립트");
    note.segments.forEach((t) => {
      const p = note.participants.find((p) => p.sp === t.sp);
      const name = p?.name || `화자 ${t.sp}`;
      const time = t.t ? ` [${t.t}]` : "";
      lines.push(`**[${name}]**${time} ${t.text}`);
    });
  }

  return lines.join("\n");
}

export async function saveNoteToFolder(note: NoteRecord): Promise<void> {
  if (!isFolderPickerSupported()) return;
  try {
    const handle = await getSetting<FileSystemDirectoryHandle>(FOLDER_KEY);
    if (!handle) return;

    const perm = await (handle as unknown as { requestPermission: (opts: { mode: string }) => Promise<string> }).requestPermission({ mode: "readwrite" });
    if (perm !== "granted") return;

    const d = new Date(note.createdAt);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    const fileName = `${dateStr}_${timeStr}_${sanitizeFileName(note.title)}.md`;

    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(noteToMarkdown(note));
    await writable.close();
  } catch (err) {
    console.warn("[folderStorage] 파일 저장 실패:", err);
  }
}
