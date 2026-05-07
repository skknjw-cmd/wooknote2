"use client";

import React from "react";
import type { NoteRecord } from "@/types/meeting";

interface NoteListProps {
  notes: NoteRecord[];
  currentId?: string;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings?: () => void;
}

export default function NoteList({ notes, currentId, collapsed, onSelect, onNew, onSettings }: NoteListProps) {
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const recent = notes.filter((n) => n.createdAt >= weekAgo);
  const today = recent.filter((n) => n.createdAt >= todayStart);
  const thisWeek = recent.filter((n) => n.createdAt < todayStart);

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

  if (collapsed) {
    return (
      <div
        className="sidebar"
        style={{ width: 48, alignItems: "center", paddingTop: 8, gap: 8 }}
      >
        <button className="icon-btn" onClick={onNew} title="새 녹음">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>
      </div>
    );
  }

  function renderSection(label: string, items: NoteRecord[], isLive?: boolean) {
    if (items.length === 0) return null;
    return (
      <>
        <div className="sb-section">
          {label}
          <span className="count">{items.length}</span>
        </div>
        {items.map((note) => (
          <div
            key={note.id}
            className={`sb-item${note.id === currentId ? " active" : ""}`}
            onClick={() => onSelect(note.id)}
          >
            <div className="sb-item-row1">
              {isLive && <span className="live-mini" />}
              <span className="sb-item-title">{note.title || "제목 없음"}</span>
            </div>
            <div className="sb-item-meta">
              <span>{formatTime(note.createdAt)}</span>
              {note.audioDuration > 0 && (
                <>
                  <span className="dot" />
                  <span>{formatDuration(note.audioDuration)}</span>
                </>
              )}
            </div>
            {note.memo && <div className="sb-item-snip">{note.memo}</div>}
          </div>
        ))}
      </>
    );
  }

  return (
    <div className="sidebar">
      <div className="sb-head">
        <button className="sb-newbtn" onClick={onNew}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="6" y1="1" x2="6" y2="11" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
          새 녹음
          <span className="kbd">⌘N</span>
        </button>
        <div className="sb-search">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" />
          </svg>
          <input placeholder="노트 검색..." />
        </div>
      </div>

      <div className="sb-list">
        {renderSection("오늘", today)}
        {renderSection("이번 주", thisWeek)}
        {notes.length === 0 && (
          <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--ink-4)", fontSize: 12 }}>
            아직 노트가 없습니다
          </div>
        )}
      </div>

      <div className="sb-foot">
        <div className="sb-avatar">A</div>
        <span className="sb-foot-name">AutoNote</span>
        <button className="icon-btn" title="설정" onClick={onSettings}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
