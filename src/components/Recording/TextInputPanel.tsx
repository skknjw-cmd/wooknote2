"use client";

import React, { useState } from "react";

export interface TextSubmitData {
  title: string;
  date: string;
  text: string;
}

interface TextInputPanelProps {
  onSubmit: (data: TextSubmitData) => void;
  onBack?: () => void;
}

export default function TextInputPanel({ onSubmit, onBack }: TextInputPanelProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    const ampm = d.getHours() < 12 ? "오전" : "오후";
    const h = d.getHours() % 12 || 12;
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${ampm} ${h}:${m}`;
  });
  const [text, setText] = useState("");

  function handleSubmit() {
    if (!text.trim()) return;
    onSubmit({ title, date, text });
  }

  return (
    <div className="entry-stage">
      <header className="entry-head">
        <button className="back" onClick={onBack}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="10 4 6 8 10 12" />
          </svg>
          돌아가기
        </button>
        <h2>텍스트로 시작</h2>
      </header>

      <div className="entry-body">
        <div className="meta-row">
          <div className="field">
            <label>회의 제목</label>
            <input
              className="tx"
              placeholder="예: Q2 예산 검토"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label>일시</label>
            <input
              className="tx"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>회의록 본문</label>
          <textarea
            className="tx"
            placeholder={"회의 내용을 자유롭게 적어주세요.\n\n빈 줄 후 새 단락을 시작하면 자동으로 블록이 분리됩니다.\nAI 정리는 본문 작성이 끝난 뒤 수동으로 실행할 수 있어요."}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="note">텍스트 입력 모드에서는 트랜스크립트 패널이 숨김 처리되며, 노트 영역 100%로 동작합니다.</div>
        </div>
      </div>

      <footer className="entry-foot">
        <button className="secondary" onClick={onBack}>취소</button>
        <button className="primary" onClick={handleSubmit} disabled={!text.trim()}>
          노트 만들기
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="6 4 10 8 6 12" />
          </svg>
        </button>
      </footer>
    </div>
  );
}
