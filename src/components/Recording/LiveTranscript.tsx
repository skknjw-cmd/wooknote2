"use client";

import React, { useRef, useEffect } from "react";
import SpeakerBubble from "./SpeakerBubble";
import RecordingBar from "./RecordingBar";
import type { TurnSegment, Participant } from "@/types/meeting";

interface LiveTranscriptProps {
  turns: TurnSegment[];
  keywords: { w: string; n: number; on?: boolean }[];
  participants: Participant[];
  mode: "live" | "review";
  isRecording: boolean;
  elapsedMs: number;
  onToggleRecording: () => void;
  onSpeakerName: (sp: number, name: string) => void;
  onToggleKeyword: (word: string) => void;
  onEditTurn: (id: number, newText: string) => void;
  onSplitTurn: (id: number, beforeText: string, afterText: string) => void;
  reviewOffset?: number;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function LiveTranscript({
  turns,
  keywords,
  participants,
  mode,
  isRecording,
  elapsedMs,
  onToggleRecording,
  onSpeakerName,
  onToggleKeyword,
  onEditTurn,
  onSplitTurn,
  reviewOffset = 0,
}: LiveTranscriptProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === "live" && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [turns, mode]);

  return (
    <div className="tr-pane" style={{ paddingTop: reviewOffset }}>
      {/* Header */}
      <div className="tr-head">
        <div className="h-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8a5 5 0 0110 0" strokeLinecap="round" />
            <rect x="1.5" y="8" width="3" height="5" rx="1.5" />
            <rect x="11.5" y="8" width="3" height="5" rx="1.5" />
          </svg>
          트랜스크립트
        </div>
        {mode === "live" ? (
          <div className="live-pill" style={{ marginLeft: "auto" }}>
            <span className="dot" />
            LIVE {formatElapsed(elapsedMs)}
          </div>
        ) : (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)" }}>
            총 {formatElapsed(elapsedMs)}
          </span>
        )}
      </div>

      {/* Keyword chips */}
      {keywords.length > 0 && (
        <div className="tr-kw">
          {keywords.map((k) => (
            <button
              key={k.w}
              className={`kw-chip${k.on ? " on" : ""}`}
              onClick={() => onToggleKeyword(k.w)}
            >
              {k.w}
              <span className="ct">{k.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Transcript body */}
      <div className="tr-body" ref={bodyRef}>
        {turns.length === 0 ? (
          <div style={{ padding: "24px 0", color: "var(--ink-4)", fontSize: 12.5, textAlign: "center" }}>
            {isRecording ? "음성을 인식하는 중..." : "녹음을 시작하면 실시간으로 표시됩니다"}
          </div>
        ) : (
          turns.map((turn) => (
            <SpeakerBubble
              key={turn.id}
              turn={turn}
              participants={participants}
              onSpeakerName={onSpeakerName}
              onEditTurn={onEditTurn}
              onSplitTurn={onSplitTurn}
            />
          ))
        )}
      </div>

      {/* Recording control bar */}
      <RecordingBar
        isRecording={isRecording}
        elapsedMs={elapsedMs}
        onToggle={onToggleRecording}
      />
    </div>
  );
}
