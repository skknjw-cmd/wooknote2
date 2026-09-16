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

  // 보장되는 것은 "녹음 중이 아니다"가 아니라 "지금 보고 있는 이 노트는 녹음 중이 아니다"다.
  // appMode가 review가 되는 길은 둘뿐이고(page.tsx), 둘 다 이 노트를 녹음 대상에서 빼놓는다:
  //   1) handleOpenNote — 여는 노트가 stt.recordingNoteId와 다를 때만 review를 고른다.
  //   2) handleToggleRecording의 중지 분기 — 이 노트의 녹음을 끝내며 review로 넘어간다
  //      (stopRecording이 같은 배치에서 isRecording을 false로 내린다).
  // stt.isRecording 자체는 review에서도 참일 수 있다. A를 녹음하는 중에 사이드바에서 B를 열면
  // B는 review인데 A의 녹음은 계속 돌아간다. 그래도 라벨을 정하는 것은 "이 노트"이므로 B의
  // 버튼은 "이어 녹음"이 맞고, 실제로 누르면 page.tsx의 refuseWhileRecording이 막아 세운다.
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
