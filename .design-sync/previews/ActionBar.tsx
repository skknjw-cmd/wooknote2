import React from "react";
import { ActionBar } from "autonote";

const noop = () => {};

/** 검토 모드의 하단 액션 바. live 모드에서는 null을 돌려주므로 셀이 비어 보이는 게 정상이다. */
export function Review() {
  return (
    <div style={{ width: 640, border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
      <ActionBar mode="review" onToggleRecording={noop} onExport={noop} onSave={noop} />
    </div>
  );
}
