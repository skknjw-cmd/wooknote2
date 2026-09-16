import React from "react";
import { NoteList } from "autonote";

const noop = () => {};
const DAY = 86400000;

function note(id: string, title: string, ago: number, turns: number) {
  return {
    id,
    title,
    createdAt: Date.now() - ago,
    segments: Array.from({ length: turns }, (_, i) => ({ id: i, sp: (i % 4) + 1, t: "0:00", text: "" })),
    speakerMapping: {},
    participants: [],
    audioDuration: turns * 9000,
    keywords: [],
    memo: "",
    summaryBullets: [],
    actions: [],
    decisions: [],
    questions: [],
    nextAgenda: [],
    context: "",
  };
}

const notes = [
  note("a", "2026-09-16 팀 주간회의", 2 * 3600000, 42),
  note("b", "3분기 기획 리뷰", 26 * 3600000, 88),
  note("c", "디자인 시스템 정리", 3 * DAY, 17),
  note("d", "새 노트", 9 * DAY, 0),
];

/** 펼친 사이드바 — 두 번째 노트가 선택된 상태. */
export function Expanded() {
  return (
    <div style={{ height: 420, display: "flex" }}>
      <NoteList
        notes={notes}
        currentId="b"
        collapsed={false}
        onSelect={noop}
        onNew={noop}
        onSettings={noop}
        folderName="회의록"
        onPickFolder={noop}
      />
    </div>
  );
}

/** 접은 사이드바 — 아이콘만 남는다. */
export function Collapsed() {
  return (
    <div style={{ height: 420, display: "flex" }}>
      <NoteList notes={notes} currentId="b" collapsed onSelect={noop} onNew={noop} onSettings={noop} />
    </div>
  );
}

/** 노트가 하나도 없을 때. */
export function Empty() {
  return (
    <div style={{ height: 420, display: "flex" }}>
      <NoteList notes={[]} collapsed={false} onSelect={noop} onNew={noop} onSettings={noop} />
    </div>
  );
}
