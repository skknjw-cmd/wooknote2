"use client";

import React from "react";

interface ModelLoadingOverlayProps {
  status: "idle" | "loading" | "ready";
  progress: { whisper: number; speaker: number };
}

export default function ModelLoadingOverlay({ status, progress }: ModelLoadingOverlayProps) {
  if (status === "ready") return null;

  const whisperPct = Math.round(progress.whisper * 100);
  const speakerPct = Math.round(progress.speaker * 100);
  const overall = Math.round((progress.whisper * 0.8 + progress.speaker * 0.2) * 100);

  return (
    <div className="modal-bg">
      <div className="modal">
        <h3>
          <span className="spinner" />
          AI 모델 초기화 중
        </h3>
        <p className="sub">
          최초 1회만 다운로드합니다. 이후에는 인터넷 없이 동작합니다.
        </p>

        <div className="dl-row">
          <div className="dl-l">
            <span>Whisper (음성 인식)</span>
            <span className="pct">{whisperPct}%</span>
          </div>
          <div className="dl-bar">
            <div className="dl-fill" style={{ width: `${whisperPct}%` }} />
          </div>
        </div>

        <div className="dl-row">
          <div className="dl-l">
            <span>화자 분리 모델</span>
            <span className="pct">{speakerPct}%</span>
          </div>
          <div className="dl-bar">
            <div className="dl-fill" style={{ width: `${speakerPct}%` }} />
          </div>
        </div>

        <div className="dl-row">
          <div className="dl-l">
            <span style={{ fontWeight: 600 }}>전체</span>
            <span className="pct" style={{ color: "var(--ink)", fontWeight: 700 }}>{overall}%</span>
          </div>
          <div className="dl-bar">
            <div className="dl-fill" style={{ width: `${overall}%`, background: overall < 100 ? "var(--ink)" : "#16a34a" }} />
          </div>
        </div>

        <div className="foot">
          약 74~91MB 다운로드 · 캐시 저장 후 오프라인 동작
        </div>
      </div>
    </div>
  );
}
