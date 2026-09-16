import React from "react";
import { SpeakerBubble } from "autonote";

// 화자 색(--sp1~--sp4)이 이 디자인 시스템에서 가장 특징적인 토큰이라 네 명을 모두 보여준다.
const people = [
  { sp: 1, name: "김지훈", role: "PM", initials: "김" },
  { sp: 2, name: "이수민", role: "디자인", initials: "이" },
  { sp: 3, name: "박도현", role: "개발", initials: "박" },
  { sp: 4, name: "최유진", role: "마케팅", initials: "최" },
];

const noop = () => {};

function bubble(id: number, sp: number, t: string, text: string) {
  return (
    <SpeakerBubble
      key={id}
      turn={{ id, sp, t, text }}
      participants={people}
      onSpeakerName={noop}
      onEditTurn={noop}
      onSplitTurn={noop}
    />
  );
}

/** 화자 네 명이 번갈아 말하는 실제 회의 흐름 — 화자색 4종이 한눈에 들어온다. */
export function Conversation() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 520 }}>
      {bubble(1, 1, "0:03", "3분기 목표부터 확인하고 시작하겠습니다.")}
      {bubble(2, 2, "0:11", "디자인 쪽은 지난주에 시안 세 개를 넘겼습니다.")}
      {bubble(3, 3, "0:24", "API 연동은 이번 주 안에 끝납니다. 테스트가 남았어요.")}
      {bubble(4, 4, "0:38", "출시 공지는 개발 완료 시점에 맞춰 준비하겠습니다.")}
    </div>
  );
}

/** 이름을 아직 지정하지 않은 화자 — "화자 N"으로 떨어지는 기본 표시. */
export function UnnamedSpeaker() {
  return (
    <div style={{ width: 520 }}>
      <SpeakerBubble
        turn={{ id: 10, sp: 2, t: "1:02", text: "이 부분은 다음 회의에서 다시 보죠." }}
        participants={[]}
        onSpeakerName={noop}
        onEditTurn={noop}
        onSplitTurn={noop}
      />
    </div>
  );
}

/** 긴 발화 한 건 — 줄바꿈과 행간을 확인하는 셀. */
export function LongTurn() {
  return (
    <div style={{ width: 520 }}>
      {bubble(
        20,
        3,
        "2:15",
        "정리하면 이번 스프린트에서는 저장 경로를 먼저 고치고, 화면 재배치는 다음 스프린트로 넘깁니다. " +
          "그 사이에 QA가 붙을 수 있도록 테스트 계정을 미리 준비해 두기로 했습니다.",
      )}
    </div>
  );
}
