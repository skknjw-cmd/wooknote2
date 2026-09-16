"use client";

import React from "react";

export interface ActionBarProps {
  mode: "live" | "review";
  onToggleRecording: () => void;
  onExport: () => void;
  onSave?: () => void;
}

/**
 * 검토 모드에서 메인 영역 아래에 붙는 가로 바.
 *
 * [Notion 갱신]은 두지 않는다 — 같은 일을 하는 버튼이 NotionStatusPanel에 이미
 * 있고, 둘이면 어느 쪽이 무엇인지 알 수 없다.
 *
 * 경과 시간도 두지 않는다. 여기 쓸 수 있는 값은 stt.elapsedMs뿐인데, 그 카운터는
 * startRecording에서만 0으로 돌아간다 — 사이드바에서 저장된 노트를 열면 00:00이거나
 * 이 세션에서 돌렸던 *다른* 녹음의 길이를 보여준다. 이 회의의 실제 길이는 바로 옆
 * MeetingInfoPanel의 소요시간이 이미 말하고 있다.
 */
export default function ActionBar({
  mode,
  onToggleRecording,
  onExport,
  onSave,
}: ActionBarProps): React.JSX.Element | null {
  if (mode !== "review") return null;

  // review 모드는 녹음 중이 아님이 보장된다(page.tsx: 녹음이 시작되면 appMode는
  // "live"이고, handleOpenNote는 녹음 중인 노트를 열 때만 "live"를 고른다).
  // 그래서 이 버튼은 늘 "이어 녹음"이다.
  return (
    <div className="action-bar">
      <div className="ab-actions">
        <button className="btn" onClick={onToggleRecording}>이어 녹음</button>
        <button className="btn" onClick={onExport}>내보내기</button>
        <button className="btn btn-primary" onClick={onSave}>저장</button>
      </div>
    </div>
  );
}
