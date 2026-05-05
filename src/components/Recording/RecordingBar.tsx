"use client";

import React, { useEffect, useState } from "react";

interface RecordingBarProps {
  isRecording: boolean;
  elapsedMs: number;
  onToggle: () => void;
}

export default function RecordingBar({ isRecording, elapsedMs, onToggle }: RecordingBarProps) {
  const [bars, setBars] = useState<number[]>(Array(28).fill(3));

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      setBars((prev) =>
        prev.map(() => isRecording ? 3 + Math.random() * 16 : 3)
      );
    }, 120);
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
      <button
        className="rb"
        onClick={onToggle}
        title={isRecording ? "녹음 중지" : "녹음 시작"}
        style={{ background: isRecording ? "var(--rec)" : "var(--ink)" }}
      />
      <span className="timer">{formatTime(elapsedMs)}</span>
      <div className="wf">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`b${isRecording ? " live" : ""}`}
            style={{ height: h }}
          />
        ))}
      </div>
      <span className="speed-mini">1x</span>
    </div>
  );
}
