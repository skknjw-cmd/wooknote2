"use client";

import React from "react";
import { formatElapsed } from "@/components/Recording/LiveTranscript";

export interface ActionBarProps {
  mode: "live" | "review";
  elapsedMs: number;
  isRecording: boolean;
  onToggleRecording: () => void;
  onExport: () => void;
  onSave?: () => void;
}

/**
 * 검토 모드에서 메인 영역 아래에 붙는 가로 바.
 *
 * [Notion 갱신]은 여기 두지 않는다 — 같은 일을 하는 버튼이 NotionStatusPanel에
 * 이미 있고, 둘이면 어느 쪽이 무엇인지 알 수 없다.
 */
export default function ActionBar({
  mode,
  elapsedMs,
  isRecording,
  onToggleRecording,
  onExport,
  onSave,
}: ActionBarProps): React.JSX.Element | null {
  if (mode !== "review") return null;

  return (
    <div className="action-bar">
      <span className="ab-elapsed">총 {formatElapsed(elapsedMs)}</span>
      <div className="ab-actions">
        <button className="btn" onClick={onToggleRecording}>
          {isRecording ? "녹음 중지" : "이어 녹음"}
        </button>
        <button className="btn" onClick={onExport}>내보내기</button>
        <button className="btn btn-primary" onClick={onSave}>저장</button>
      </div>
    </div>
  );
}
