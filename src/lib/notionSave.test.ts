import { describe, it, expect } from "vitest";
import { noteToNotionPayload } from "./notionSave";
import type { NoteRecord } from "@/types/meeting";

const baseNote: NoteRecord = {
  id: "n1",
  title: "주간 회의",
  createdAt: new Date("2026-09-15T14:30:00").getTime(),
  entryMethod: "live",
  segments: [],
  speakerMapping: {},
  participants: [],
  audioDuration: 0,
  keywords: [],
  memo: "",
  summaryBullets: [],
  actions: [],
  decisions: [],
  questions: [],
  nextAgenda: [],
  context: "",
};

describe("noteToNotionPayload", () => {
  it("createdAt에서 YYYY-MM-DD 날짜를 만든다", () => {
    expect(noteToNotionPayload(baseNote).meetingDate).toBe("2026-09-15");
  });

  it("meetingDate가 ISO 날짜면 그대로 쓴다", () => {
    const p = noteToNotionPayload({ ...baseNote, meetingDate: "2026-08-01" });
    expect(p.meetingDate).toBe("2026-08-01");
  });

  it("meetingDate가 ISO 날짜가 아니면 createdAt으로 대체한다", () => {
    const p = noteToNotionPayload({ ...baseNote, meetingDate: "2026년 8월 1일 오후 2시" });
    expect(p.meetingDate).toBe("2026-09-15");
  });

  it("speakerMapping을 최우선으로 화자 이름을 해석한다", () => {
    const p = noteToNotionPayload({
      ...baseNote,
      speakerMapping: { "1": "김팀장" },
      participants: [{ sp: 1, name: "무시됨", role: "", initials: "" }],
      segments: [{ id: 0, sp: 1, t: "00:12", text: "안녕" }],
    });
    expect(p.turns[0].speaker).toBe("김팀장");
  });

  it("매핑이 없으면 participants의 이름을 쓴다", () => {
    const p = noteToNotionPayload({
      ...baseNote,
      participants: [{ sp: 2, name: "이책임", role: "", initials: "" }],
      segments: [{ id: 0, sp: 2, t: "", text: "네" }],
    });
    expect(p.turns[0].speaker).toBe("이책임");
  });

  it("둘 다 없으면 '화자 N'으로 적는다", () => {
    const p = noteToNotionPayload({
      ...baseNote,
      segments: [{ id: 0, sp: 3, t: "", text: "네" }],
    });
    expect(p.turns[0].speaker).toBe("화자 3");
  });

  it("participants가 있으면 attendees를 그 이름들로 채운다", () => {
    const p = noteToNotionPayload({
      ...baseNote,
      participants: [
        { sp: 1, name: "김팀장", role: "", initials: "" },
        { sp: 2, name: "", role: "", initials: "" },
      ],
    });
    expect(p.attendees).toEqual(["김팀장", "화자 2"]);
  });

  it("participants가 없으면 attendees 자유 텍스트를 쉼표로 나눈다", () => {
    const p = noteToNotionPayload({ ...baseNote, attendees: "김팀장, 이책임" });
    expect(p.attendees).toEqual(["김팀장", "이책임"]);
  });

  it("audioDuration(ms)을 소요시간 문자열로 만든다", () => {
    expect(noteToNotionPayload({ ...baseNote, audioDuration: 5025000 }).durationText).toBe("1:23:45");
    expect(noteToNotionPayload({ ...baseNote, audioDuration: 125000 }).durationText).toBe("2:05");
    expect(noteToNotionPayload({ ...baseNote, audioDuration: 0 }).durationText).toBe("");
  });

  it("제목이 비었거나 '새 노트'면 날짜·시각으로 자동 생성한다", () => {
    expect(noteToNotionPayload({ ...baseNote, title: "새 노트" }).title).toBe("2026-09-15 14:30 회의");
    expect(noteToNotionPayload({ ...baseNote, title: "  " }).title).toBe("2026-09-15 14:30 회의");
    expect(noteToNotionPayload(baseNote).title).toBe("주간 회의");
  });

  it("entryMethod가 없으면 live로 본다", () => {
    const { entryMethod, ...rest } = baseNote;
    void entryMethod;
    expect(noteToNotionPayload(rest as NoteRecord).entryMethod).toBe("live");
  });
});
