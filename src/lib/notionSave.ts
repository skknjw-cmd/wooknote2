import type {
  NoteRecord,
  NotionMeetingPayload,
  NotionSaveResponse,
  NotionSaveState,
  NotionTurn,
} from "@/types/meeting";
import { hasNotionConfig, notionKeyHeaders } from "@/lib/apiKey";

/** ms → "1:23:45" 또는 "2:05". 0이면 빈 문자열. */
function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → "2026-09-15" (로컬 시간 기준) */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date → "2026-09-15 14:30 회의" */
function autoTitle(d: Date): string {
  return `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())} 회의`;
}

/** 화자 번호 → 표시 이름. 매핑 > 참석자 명단 > "화자 N" */
function speakerName(note: NoteRecord, sp: number): string {
  const mapped = note.speakerMapping?.[String(sp)];
  if (mapped) return mapped;
  const found = note.participants?.find((p) => p.sp === sp)?.name;
  if (found) return found;
  return `화자 ${sp}`;
}

/** NoteRecord를 /api/notion 페이로드로 변환한다. audioBlob 등 직렬화 불가 필드는 버린다. */
export function noteToNotionPayload(note: NoteRecord): NotionMeetingPayload {
  const created = new Date(note.createdAt);

  const meetingDate = /^\d{4}-\d{2}-\d{2}$/.test(note.meetingDate ?? "")
    ? note.meetingDate!
    : isoDate(created);

  const title = note.title?.trim() && note.title.trim() !== "새 노트"
    ? note.title.trim()
    : autoTitle(created);

  const attendees =
    note.participants && note.participants.length > 0
      ? note.participants.map((p) => p.name?.trim() || `화자 ${p.sp}`)
      : (note.attendees ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  const turns: NotionTurn[] = (note.segments ?? []).map((seg) => ({
    speaker: speakerName(note, seg.sp),
    time: seg.t ?? "",
    text: seg.text,
  }));

  return {
    title,
    meetingDate,
    location: note.location ?? "",
    attendees,
    durationText: formatDuration(note.audioDuration),
    entryMethod: note.entryMethod ?? "live",
    turns,
  };
}

/**
 * 노트를 Notion에 저장하고 표시용 상태를 돌려준다. 예외를 던지지 않는다 —
 * 호출자는 이 결과를 배너에 그대로 쓰면 된다.
 */
export async function pushToNotion(note: NoteRecord): Promise<NotionSaveState> {
  if (!hasNotionConfig()) return { kind: "unconfigured" };

  try {
    const res = await fetch("/api/notion", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...notionKeyHeaders() },
      body: JSON.stringify(noteToNotionPayload(note)),
    });

    const data = (await res.json()) as NotionSaveResponse;

    if (data.ok) {
      return { kind: "saved", skippedProperties: data.skippedProperties };
    }
    if (data.stage === "append") {
      return { kind: "partial", savedBlocks: data.savedBlocks, totalBlocks: data.totalBlocks };
    }
    return { kind: "failed", message: data.error };
  } catch (err) {
    return {
      kind: "failed",
      message: err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
    };
  }
}
