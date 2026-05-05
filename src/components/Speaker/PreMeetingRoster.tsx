"use client";

import React, { useState } from "react";
import type { Participant } from "@/types/meeting";

interface PreMeetingRosterProps {
  onStart: (participants: Participant[]) => void;
  onSkip: () => void;
  onBack?: () => void;
}

const DEFAULT_PARTICIPANTS: Participant[] = [
  { sp: 1, name: "", role: "", initials: "?" },
];

export default function PreMeetingRoster({ onStart, onSkip, onBack }: PreMeetingRosterProps) {
  const [roster, setRoster] = useState<Participant[]>(DEFAULT_PARTICIPANTS);
  const [calOpen, setCalOpen] = useState(true);

  function updateName(i: number, name: string) {
    setRoster((r) =>
      r.map((p, j) =>
        j === i
          ? { ...p, name, initials: name.trim() ? name.trim()[0] : "?" }
          : p
      )
    );
  }

  function updateRole(i: number, role: string) {
    setRoster((r) => r.map((p, j) => (j === i ? { ...p, role } : p)));
  }

  function addRow() {
    const sp = roster.length + 1;
    setRoster((r) => [...r, { sp, name: "", role: "", initials: "?" }]);
  }

  function deleteRow(i: number) {
    setRoster((r) => r.filter((_, j) => j !== i).map((p, j) => ({ ...p, sp: j + 1 })));
  }

  // TODO: 캘린더 API 연동 후 구현 (Google Calendar / Outlook)
  // function importFromCalendar() { ... }

  function handleStart() {
    const valid = roster.filter((p) => p.name.trim());
    onStart(valid);
  }

  return (
    <div className="roster-stage">
      {onBack && (
        <header className="entry-head" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <button className="back" onClick={onBack}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="10 4 6 8 10 12" />
            </svg>
            돌아가기
          </button>
        </header>
      )}
      <div className="roster-card">
        <h2>회의 참여자</h2>
        <p className="sub">
          참여자를 미리 등록하면 녹음이 시작될 때 화자를 자동으로 매칭해드려요.<br />
          나중에도 트랜스크립트에서 언제든 수정할 수 있습니다.
        </p>

        {calOpen && (
          <div className="cal-suggest">
            <span className="ico">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="12" height="11" rx="1.5" />
                <line x1="5" y1="1.5" x2="5" y2="4.5" />
                <line x1="11" y1="1.5" x2="11" y2="4.5" />
                <line x1="2" y1="7" x2="14" y2="7" />
              </svg>
            </span>
            <div className="body">
              <b>생산 라인 점검 (오후 3:30 - 4:30)</b><br />
              <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>캘린더 참석자 3명을 가져올까요?</span>
            </div>
            <button
              disabled
              title="캘린더 연동은 추후 지원 예정입니다"
              style={{ opacity: 0.45, cursor: "not-allowed" }}
            >
              준비 중
            </button>
          </div>
        )}

        <div className="label">참여자 ({roster.length}명)</div>
        <div className="roster-list">
          {roster.map((p, i) => (
            <div key={i} className="roster-row">
              <span className={`av sp${p.sp}`} style={{ background: p.sp <= 4 ? undefined : "var(--ink-4)" }}>
                {p.initials}
              </span>
              <input
                className="name-input"
                value={p.name}
                onChange={(e) => updateName(i, e.target.value)}
                placeholder="이름"
              />
              <input
                className="role-input"
                value={p.role}
                onChange={(e) => updateRole(i, e.target.value)}
                placeholder="역할 (선택)"
              />
              <button className="del-btn" onClick={() => deleteRow(i)} title="삭제">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="3" y1="3" x2="11" y2="11" />
                  <line x1="11" y1="3" x2="3" y2="11" />
                </svg>
              </button>
            </div>
          ))}
          <div className="roster-row" style={{ opacity: 0.6 }}>
            <span className="av placeholder">?</span>
            <input className="name-input" placeholder="추가 화자는 녹음 중 자동 감지됩니다" disabled />
          </div>
        </div>

        <button className="add-row" onClick={addRow}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="6.5" y1="1" x2="6.5" y2="12" />
            <line x1="1" y1="6.5" x2="12" y2="6.5" />
          </svg>
          참여자 직접 추가
        </button>

        <div className="tip">
          <span className="ico">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="6.5" cy="6.5" r="5.5" />
              <line x1="6.5" y1="6" x2="6.5" y2="9.5" />
              <circle cx="6.5" cy="3.5" r="0.5" fill="currentColor" />
            </svg>
          </span>
          <span>음성 임베딩으로 화자를 익명 분리하고, 등록된 이름과 매칭합니다. 등록되지 않은 화자가 말하면 새 화자로 인식되며 라이브 중 이름을 지정할 수 있어요.</span>
        </div>

        <div className="roster-foot">
          <button className="skip" onClick={onSkip}>건너뛰기</button>
          <button className="start" onClick={handleStart}>녹음 시작</button>
        </div>
      </div>
    </div>
  );
}
