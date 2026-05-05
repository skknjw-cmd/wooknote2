"use client";

import React, { useRef, useState } from "react";
import type { TurnSegment, Participant } from "@/types/meeting";

interface SpeakerBubbleProps {
  turn: TurnSegment;
  participants: Participant[];
  onSpeakerName: (sp: number, name: string) => void;
  onEditTurn: (id: number, newText: string) => void;
  onSplitTurn: (id: number, beforeText: string, afterText: string) => void;
  onAnchor?: (t: string) => void;
}

export default function SpeakerBubble({
  turn,
  participants,
  onSpeakerName,
  onEditTurn,
  onSplitTurn,
  onAnchor,
}: SpeakerBubbleProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const participant = participants.find((p) => p.sp === turn.sp);
  const displayName = participant?.name || `화자 ${turn.sp}`;
  const spIdx = ((turn.sp - 1) % 4) + 1;
  const spClass = `sp${spIdx}`;

  // ── 화자 이름 편집 ──────────────────────────────────────────────────────────

  function startNameEdit() {
    setNameDraft(displayName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  function commitNameEdit() {
    if (nameDraft.trim()) onSpeakerName(turn.sp, nameDraft.trim());
    setEditingName(false);
  }

  // ── 텍스트 내용 편집 ────────────────────────────────────────────────────────

  function startTextEdit() {
    setTextDraft(turn.text);
    setEditingText(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(0, 0);
      }
    }, 0);
  }

  function commitTextEdit() {
    if (textDraft.trim()) onEditTurn(turn.id, textDraft.trim());
    setEditingText(false);
  }

  function handleSplit() {
    const pos = textareaRef.current?.selectionStart ?? textDraft.length;
    const before = textDraft.slice(0, pos).trim();
    const after = textDraft.slice(pos).trim();
    if (!before || !after) return; // 분리 위치가 끝이거나 시작이면 무시
    onSplitTurn(turn.id, before, after);
    setEditingText(false);
  }

  return (
    <div className="turn">
      <div className="turn-head">
        {/* 화자 이름 — 클릭으로 편집 */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitNameEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNameEdit();
              if (e.key === "Escape") setEditingName(false);
            }}
            style={{
              fontSize: 11.5, fontWeight: 700, color: `var(--${spClass})`,
              border: "none", outline: "1px solid var(--border-strong)",
              borderRadius: 4, padding: "1px 5px", background: "var(--surface)",
              width: 100, fontFamily: "inherit",
            }}
          />
        ) : (
          <span
            className={`sp-name ${spClass}`}
            onClick={startNameEdit}
            title="클릭하여 화자 이름 수정"
          >
            {displayName}
          </span>
        )}

        <span
          className="turn-time"
          onClick={() => onAnchor?.(turn.t)}
          title="이 시점으로 이동"
        >
          {turn.t}
        </span>

        <div className="tr-actions">
          {/* 연필: 텍스트 내용 편집 */}
          <button className="tr-action-btn" title="내용 수정" onClick={startTextEdit}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 10.5V8L8.5 1.5 11 4 4.5 10.5H2Z" />
            </svg>
          </button>
          {/* 복사 */}
          <button
            className="tr-action-btn"
            title="복사"
            onClick={() => navigator.clipboard.writeText(turn.text)}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="4" width="7" height="7" rx="1" />
              <path d="M2 9V2h7" />
            </svg>
          </button>
        </div>
      </div>

      {/* 텍스트 본문 — 편집 모드 */}
      {editingText ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          <textarea
            ref={textareaRef}
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingText(false);
            }}
            rows={Math.max(2, Math.ceil(textDraft.length / 40))}
            style={{
              width: "100%",
              fontSize: 13.5,
              lineHeight: 1.65,
              color: "var(--ink)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-md)",
              padding: "6px 8px",
              resize: "vertical",
              fontFamily: "var(--font-sans)",
              background: "var(--surface)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={handleSplit}
              title="커서 위치에서 발화 분리"
              style={{
                fontSize: 11.5, padding: "2px 8px",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-sm)",
                background: "var(--surface-2)",
                color: "var(--ink-2)", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ✂ 여기서 분리
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setEditingText(false)}
              style={{
                fontSize: 11.5, padding: "2px 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                background: "none",
                color: "var(--ink-3)", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              취소
            </button>
            <button
              onClick={commitTextEdit}
              style={{
                fontSize: 11.5, padding: "2px 10px",
                border: "none",
                borderRadius: "var(--r-sm)",
                background: "var(--ink)", color: "#fff",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <div className="turn-text">
          {turn.typing ? <span className="typing">{turn.text}</span> : turn.text}
        </div>
      )}
    </div>
  );
}
