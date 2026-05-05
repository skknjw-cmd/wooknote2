"use client";

import React, { useEffect, useState } from "react";

interface RecordingBarProps {
  isRecording: boolean;
  elapsedMs: number;
  onToggle: () => void;
}

export default function RecordingBar({ isRecording, elapsedMs, onToggle }: RecordingBarProps) {
  const [bars, setBars] = useState<number[]>(Array(32).fill(3));

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      setBars((prev) =>
        prev.map(() => 2 + Math.random() * 18)
      );
    }, 100);
    return () => clearInterval(id);
  }, [isRecording]);

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  return (
    <div className="tr-rec">
      {/* REC 인디케이터 */}
      {isRecording && (
        <div className="tr-rec-indicator">
          <span className="tr-rec-dot" />
          <span className="tr-rec-label">REC</span>
        </div>
      )}

      {/* 타이머 */}
      <span className="timer">{formatTime(elapsedMs)}</span>

      {/* 파형 */}
      <div className="wf">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`b${isRecording ? " live" : ""}`}
            style={{ height: isRecording ? h : 3 }}
          />
        ))}
      </div>

      {/* 정지/시작 버튼 */}
      <button
        className="rb"
        onClick={onToggle}
        title={isRecording ? "녹음 중지" : "녹음 시작"}
      >
        {isRecording ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
            <rect x="1" y="1" width="8" height="8" rx="1.5" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="white">
            <polygon points="2,1 10,5.5 2,10" />
          </svg>
        )}
      </button>
    </div>
  );
}
