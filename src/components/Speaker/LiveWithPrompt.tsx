"use client";

import React, { useEffect } from "react";
import type { Participant } from "@/types/meeting";

interface LiveWithPromptProps {
  newSpeakerSp: number;
  candidates: Participant[];
  position?: { left: number; top: number };
  onAssign: (sp: number) => void;
  onNewParticipant: () => void;
  onDismiss: () => void;
}

export default function LiveWithPrompt({
  newSpeakerSp,
  candidates,
  position = { left: 296, top: 282 },
  onAssign,
  onNewParticipant,
  onDismiss,
}: LiveWithPromptProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = parseInt(e.key);
      if (n >= 1 && n <= candidates.length) {
        onAssign(candidates[n - 1].sp);
      }
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidates, onAssign, onDismiss]);

  return (
    <div className="map-prompt" style={{ left: position.left, top: position.top }}>
      <div className="mp-h">
        <span className="av" style={{ background: "var(--sp4)" }}>?</span>
        <span>새 화자 감지됨 · <b>화자 {newSpeakerSp}</b></span>
      </div>
      <div className="mp-q">이 분은 누구인가요?</div>
      <div className="mp-options">
        {candidates.map((p, i) => (
          <button
            key={p.sp}
            className="mp-opt kbd-hint"
            onClick={() => onAssign(p.sp)}
          >
            <span className={`av sp${p.sp}`}>{p.initials}</span>
            <span>{p.name}</span>
            <span className="role">{p.role}</span>
            <span className="kbd">{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="mp-foot">
        <button onClick={onDismiss}>나중에</button>
        <button className="new" onClick={onNewParticipant}>+ 새 참여자로 추가</button>
      </div>
    </div>
  );
}
