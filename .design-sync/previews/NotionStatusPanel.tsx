import React from "react";
import { NotionStatusPanel } from "autonote";

// 이 패널의 값어치는 상태별 문구에 있다. 일곱 가지 NotionSaveState를 전부 세운다 —
// 문구 하나하나가 "지금 회의록이 어디에 있는가"를 사실대로 말하도록 다듬은 결과물이다.
const noop = () => {};
const PAGE = "1a2b3c4d-5e6f-7890-abcd-ef1234567890";

function panel(status: any, extra: Record<string, unknown> = {}) {
  return (
    <div style={{ width: 320 }}>
      <NotionStatusPanel
        status={status}
        totalTurns={42}
        onRetry={noop}
        onSettings={noop}
        onOpenAnalysis={noop}
        {...extra}
      />
    </div>
  );
}

/** 저장 완료 — 페이지 링크와 동기화한 발화 수가 함께 뜬다. */
export function Saved() {
  return panel(
    { kind: "saved", skippedProperties: [], pageId: PAGE, syncedTurns: 42 },
    { notionPageId: PAGE, syncedTurns: 42 },
  );
}

/** 이어 녹음으로 기존 페이지에 덧붙인 경우. */
export function Appended() {
  return panel(
    { kind: "saved", skippedProperties: [], appended: true, pageId: PAGE, syncedTurns: 42 },
    { notionPageId: PAGE, syncedTurns: 42 },
  );
}

/** 원래 페이지를 찾지 못해 새로 만든 경우 — 앞 회의록이 사라졌다는 뜻이라 경고로 뜬다. */
export function PageRecreated() {
  return panel(
    { kind: "saved", skippedProperties: ["소요시간"], pageRecreated: true, pageId: PAGE, syncedTurns: 42 },
    { notionPageId: PAGE, syncedTurns: 42 },
  );
}

/** 저장 중. */
export function Saving() {
  return panel({ kind: "saving" });
}

/** 일부만 올라간 상태 — 재시도하면 중복될 수 있다는 것까지 말한다. */
export function Partial() {
  return panel({ kind: "partial", savedBlocks: 120, totalBlocks: 340, appended: true });
}

/** Notion 미설정. */
export function Unconfigured() {
  return panel({ kind: "unconfigured" });
}

/** 로컬 저장까지 실패 — 이 회의는 어디에도 없다. */
export function LocalFailed() {
  return panel({
    kind: "localFailed",
    message: "로컬(IndexedDB) 저장에 실패해 Notion 저장을 건너뜁니다.",
  });
}
