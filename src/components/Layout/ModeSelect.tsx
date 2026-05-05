"use client";

import React from "react";
import type { NoteRecord, EntryMethod } from "@/types/meeting";

export type InputMode = EntryMethod;

interface ModeSelectProps {
  onSelect: (mode: InputMode) => void;
  recentNotes?: NoteRecord[];
  onOpenNote?: (id: string) => void;
  onSettings?: () => void;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  return `${ampm} ${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const METHODS: {
  key: InputMode;
  cls: string;
  badge?: "live" | "beta";
  badgeText?: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
}[] = [
  {
    key: "live",
    cls: "m3",
    badge: "live",
    badgeText: "LIVE",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
    title: "실시간 회의 녹음",
    desc: "마이크로 회의를 실시간 받아쓰고 노트를 작성합니다.",
    cta: "녹음 준비",
  },
  {
    key: "audio",
    cls: "m2",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
    title: "녹음 파일 업로드",
    desc: "미팅이 끝났나요? 오디오 파일을 올리면 트랜스크립트로 변환합니다.",
    cta: "파일 선택",
  },
  {
    key: "text",
    cls: "m1",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    title: "텍스트로 시작",
    desc: "받아쓰지 않고 직접 회의록을 작성합니다. AI 정리는 동일하게 작동.",
    cta: "빈 노트",
  },
  {
    key: "video",
    cls: "m4",
    badge: "beta",
    badgeText: "BETA",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    title: "화상 회의 연결",
    desc: "Zoom · Meet · Teams에 봇을 보내 자동으로 받아씁니다.",
    cta: "연결",
  },
];

export default function ModeSelect({ onSelect, recentNotes = [], onOpenNote, onSettings }: ModeSelectProps) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="logo">
          <span className="mark">A</span>
          <span>AutoNote</span>
        </div>
        <div className="links">
          <a>전체 노트</a>
          <a>공유받은</a>
          <a>휴지통</a>
        </div>
        <div className="right">
          <button className="icon-btn" title="검색">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="4.5" /><line x1="10.5" y1="10.5" x2="13.5" y2="13.5" />
            </svg>
          </button>
          <button className="icon-btn" title="설정" onClick={onSettings}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1" />
            </svg>
          </button>
          <span className="avatar">서</span>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="eyebrow">시작하기</div>
        <h1>어떻게 회의록을 작성하시겠어요?</h1>
        <p>4가지 방법 중 하나를 선택하세요. 어떤 방식이든 동일한 노트 구조와 AI 정리를 사용합니다.</p>
      </section>

      <section className="method-grid">
        {METHODS.map((m) => (
          <div key={m.key} className={`method-card ${m.cls}`} onClick={() => onSelect(m.key)}>
            {m.badge && (
              <span className={`badge ${m.badge}`}>{m.badgeText}</span>
            )}
            <span className="ic">{m.icon}</span>
            <h3>{m.title}</h3>
            <p>{m.desc}</p>
            <span className="cta">{m.cta}<span className="arrow"> →</span></span>
          </div>
        ))}
      </section>

      {recentNotes.length > 0 && (
        <section className="recent-row">
          <div className="h-row">
            <h2>최근 노트</h2>
            <button className="more">전체 보기 →</button>
          </div>
          <div className="recent-grid">
            {recentNotes.slice(0, 3).map((note) => (
              <div key={note.id} className="recent-card" onClick={() => onOpenNote?.(note.id)}>
                <div className="t">{note.title || "제목 없음"}</div>
                <div className="m">
                  <span>{formatTime(note.createdAt)}</span>
                  {note.audioDuration > 0 && (
                    <>
                      <span className="dot" />
                      <span>{formatDuration(note.audioDuration)}</span>
                    </>
                  )}
                </div>
                {note.summaryBullets?.[0] && (
                  <div className="s">{note.summaryBullets[0]}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
