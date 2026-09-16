"use client";

import React, { useState, useEffect, useRef } from "react";
import type { NoteRecord, Participant } from "@/types/meeting";
import { formatDuration } from "@/lib/notionSave";

export interface MeetingInfoPanelProps {
  note: NoteRecord | null;
  participants: Participant[];
  onUpdateNote?: (note: NoteRecord) => void;
}

// ── 속성 행 (회의 일시 / 장소 / 참석자) ───────────────────────────
function PropRow({
  icon,
  label,
  value,
  placeholder,
  onSave,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    setEditing(false);
    onSave(draft);
  }

  return (
    <div className="prop-row" onClick={() => !editing && setEditing(true)}>
      <span className="prop-icon">{icon}</span>
      <span className="prop-label">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          className="prop-input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(value); } }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className={`prop-value${!value ? " empty" : ""}`}>
          {value || placeholder}
        </span>
      )}
    </div>
  );
}

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  return `${y}.${mo}.${day} ${ampm} ${h % 12 || 12}:${m}`;
}

// 소요시간 행의 아이콘 — 원본에 없던 새 행이라 새로 만든다.
function IconClock() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="5" y1="6" x2="11" y2="6" />
      <line x1="5" y1="9" x2="9" y2="9" />
    </svg>
  );
}

/**
 * 회의 일시·장소·참석자·소요시간과 자유 메모.
 *
 * 여기 있는 값들은 Notion으로 실제 나가는 값이다(장소는 속성이 아니라 트랜스크립트 맨 위
 * "회의 정보" 줄에 실린다). 그래서 사용자가 저장 전에 고칠 수 있어야 한다.
 * 제목은 여기 없다 — 헤더 입력 하나가 유일한 제목 입력구다.
 */
export default function MeetingInfoPanel({ note, participants, onUpdateNote }: MeetingInfoPanelProps) {
  const participantList = participants.length > 0 ? participants : (note?.participants ?? []);
  const durationText = note?.audioDuration ? formatDuration(note.audioDuration) : "";

  return (
    <div className="meeting-info-panel">
      {/* Properties */}
      <div className="note-props">
        <PropRow
          icon={
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="2" y="3" width="12" height="11" rx="1.5" />
              <line x1="2" y1="7" x2="14" y2="7" />
              <line x1="5" y1="1.5" x2="5" y2="4.5" />
              <line x1="11" y1="1.5" x2="11" y2="4.5" />
            </svg>
          }
          label="회의 일시"
          value={note?.meetingDate ?? (note ? formatDateTime(note.createdAt) : "")}
          placeholder="날짜 및 시간 입력"
          onSave={(v) => note && onUpdateNote?.({ ...note, meetingDate: v })}
        />
        <PropRow
          icon={
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 1.5a4.5 4.5 0 014.5 4.5c0 3-4.5 8.5-4.5 8.5S3.5 9 3.5 6A4.5 4.5 0 018 1.5z" />
              <circle cx="8" cy="6" r="1.5" />
            </svg>
          }
          label="회의 장소"
          value={note?.location ?? ""}
          placeholder="장소 입력"
          onSave={(v) => note && onUpdateNote?.({ ...note, location: v })}
        />
        <PropRow
          icon={
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="6" cy="5" r="2.5" />
              <path d="M1 13a5 5 0 0110 0" />
              <circle cx="12" cy="5" r="2" />
              <path d="M14 13a3 3 0 00-3-3" />
            </svg>
          }
          label="참석자"
          value={
            note?.attendees ??
            (participantList.length > 0
              ? participantList.map((p) => p.name || `화자 ${p.sp}`).join(", ")
              : "")
          }
          placeholder="이름 입력 (쉼표로 구분)"
          onSave={(v) => note && onUpdateNote?.({ ...note, attendees: v })}
        />
        {durationText && (
          <div className="prop-row prop-row-readonly">
            <span className="prop-icon"><IconClock /></span>
            <span className="prop-label">소요시간</span>
            <span className="prop-value">{durationText}</span>
          </div>
        )}
      </div>

      {/* Block 7: 자유 메모 */}
      <div className="nblock">
        <div className="nblock-h">
          <span className="ico"><IconNote /></span>
          자유 메모
        </div>
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            if (note) onUpdateNote?.({ ...note, memo: e.currentTarget.textContent ?? "" });
          }}
          style={{ outline: "none", fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-2)", minHeight: 60 }}
        >
          {note?.memo ?? ""}
        </div>
      </div>
    </div>
  );
}
