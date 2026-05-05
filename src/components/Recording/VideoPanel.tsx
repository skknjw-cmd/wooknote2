"use client";

import React, { useState } from "react";

interface VideoPanelProps {
  onSubmit: (data: { platform: string; url: string }) => void;
  onBack?: () => void;
}

const PLATFORMS = [
  { key: "zoom", cls: "zoom", label: "Z", name: "Zoom", state: "connected" as const },
  { key: "meet", cls: "meet", label: "M", name: "Google Meet", state: "disconnected" as const },
  { key: "teams", cls: "teams", label: "T", name: "MS Teams", state: "disconnected" as const },
];

const UPCOMING = [
  { id: 1, title: "주간 팀 스탠드업", meta: "오후 5:00 · Zoom · 8명", color: "var(--sp1)", autoJoin: true },
  { id: 2, title: "고객사 PoC 결과 보고", meta: "내일 오전 11:00 · Google Meet · 6명", color: "var(--sp3)", autoJoin: false },
];

export default function VideoPanel({ onSubmit, onBack }: VideoPanelProps) {
  const [url, setUrl] = useState("");
  const [autoJoin, setAutoJoin] = useState<Record<number, boolean>>({ 1: true, 2: false });

  return (
    <div className="entry-stage">
      <header className="entry-head">
        <button className="back" onClick={onBack}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="10 4 6 8 10 12" />
          </svg>
          돌아가기
        </button>
        <h2>화상 회의 연결</h2>
        <div className="actions">
          <span style={{ fontSize: 10, fontWeight: 600, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 999, letterSpacing: "0.05em" }}>
            BETA
          </span>
        </div>
      </header>

      <div className="entry-body">
        <h3>플랫폼 선택</h3>
        <div className="video-providers">
          {PLATFORMS.map((p) => (
            <div key={p.key} className={`provider ${p.cls}`}>
              <span className="p-ic">{p.label}</span>
              <span className="p-name">{p.name}</span>
              <span className={`p-state ${p.state}`}>
                {p.state === "connected" ? "✓ 연결됨" : "연결 필요"}
              </span>
            </div>
          ))}
        </div>

        <h3>회의 URL</h3>
        <div className="url-row">
          <input
            type="text"
            placeholder="https://us02web.zoom.us/j/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="join-btn" onClick={() => url && onSubmit({ platform: "zoom", url })}>
            참여
          </button>
        </div>

        <div className="video-tip">
          <span className="ico">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6.5" />
              <line x1="8" y1="7" x2="8" y2="11" />
              <circle cx="8" cy="5" r="0.5" fill="currentColor" />
            </svg>
          </span>
          <span>
            <strong style={{ color: "var(--ink)", fontWeight: 600 }}>AutoNote 봇</strong>이 회의에 참여자로 입장합니다.
            화면에는 "AutoNote 노트 작성 중"으로 표시되며, 호스트는 언제든 내보낼 수 있어요.
            오디오만 처리하고 화면은 녹화하지 않습니다.
          </span>
        </div>

        <h3>예약 회의 (캘린더 연동)</h3>
        <div className="opts-card" style={{ background: "var(--surface)" }}>
          {UPCOMING.map((ev, i) => (
            <div key={ev.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 0",
              borderTop: i > 0 ? "1px solid var(--divider)" : undefined,
            }}>
              <span style={{ width: 4, height: 32, background: ev.color, borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{ev.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{ev.meta}</div>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)", flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={autoJoin[ev.id] ?? ev.autoJoin}
                  onChange={(e) => setAutoJoin((prev) => ({ ...prev, [ev.id]: e.target.checked }))}
                  style={{ accentColor: "var(--ink)" }}
                />
                자동 참여
              </label>
            </div>
          ))}
        </div>
      </div>

      <footer className="entry-foot">
        <button className="secondary" onClick={onBack}>취소</button>
        <button className="primary rec" onClick={() => onSubmit({ platform: "zoom", url })}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
          봇 입장 시작
        </button>
      </footer>
    </div>
  );
}
