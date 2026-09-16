import React from "react";
import { MeetingInfoPanel } from "autonote";

const noop = () => {};

const people = [
  { sp: 1, name: "김지훈", role: "PM", initials: "김" },
  { sp: 2, name: "이수민", role: "디자인", initials: "이" },
  { sp: 3, name: "박도현", role: "개발", initials: "박" },
];

const base = {
  id: "a",
  title: "2026-09-16 팀 주간회의",
  createdAt: Date.parse("2026-09-16T15:21:00"),
  segments: [],
  speakerMapping: {},
  participants: people,
  audioDuration: 724000,
  keywords: [],
  memo: "",
  summaryBullets: [],
  actions: [],
  decisions: [],
  questions: [],
  nextAgenda: [],
  context: "",
};

/** 값이 채워진 상태 — 일시·장소·참석자·소요시간에 자유 메모까지. */
export function Filled() {
  return (
    <div style={{ width: 320 }}>
      <MeetingInfoPanel
        note={{
          ...base,
          meetingDate: "2026-09-16",
          location: "3층 회의실",
          memo: "다음 회의 전까지 API 응답 예시를 공유하기로 함.",
        }}
        participants={people}
        onUpdateNote={noop}
      />
    </div>
  );
}

/** 녹음만 끝나고 아직 아무것도 입력하지 않은 상태 — placeholder가 보인다. */
export function Untouched() {
  return (
    <div style={{ width: 320 }}>
      <MeetingInfoPanel note={base} participants={people} onUpdateNote={noop} />
    </div>
  );
}
