"use client";

import React, { useState, useRef } from "react";

interface AudioFilePanelProps {
  onSubmit: (file: File) => void;
  onBack?: () => void;
}

export default function AudioFilePanel({ onSubmit, onBack }: AudioFilePanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
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
        <h2>녹음 파일 업로드</h2>
      </header>

      <div className="entry-body">
        <div
          className={`dropzone${dragOver ? " over" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="ic-big">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3>여기에 끌어다 놓거나 클릭해 선택</h3>
          <p>최대 2시간 · 4GB까지 업로드할 수 있어요</p>
          <div className="formats">
            {[".mp3", ".m4a", ".wav", ".webm", ".flac", ".ogg"].map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>

        {file && (
          <div className="upload-card">
            <span className="file-ic">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </span>
            <div className="body">
              <div className="fn">{file.name}</div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: "0%" }} /></div>
              <div className="meta-line">
                <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
            </div>
          </div>
        )}

        <h3>옵션</h3>
        <div className="opts-card">
          <label className="opt">
            <input type="checkbox" defaultChecked />
            <span>화자 자동 구분</span>
            <select className="lang-select" defaultValue="auto">
              <option value="auto">자동 감지</option>
              <option>2명</option><option>3명</option><option>4명 이상</option>
            </select>
          </label>
          <label className="opt">
            <input type="checkbox" defaultChecked />
            <span>녹음 종료 후 AI 자동 정리</span>
          </label>
          <label className="opt">
            <input type="checkbox" defaultChecked />
            <span>언어</span>
            <select className="lang-select" defaultValue="ko">
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>
        </div>
      </div>

      <footer className="entry-foot">
        <button className="secondary" onClick={onBack}>취소</button>
        <button
          className="primary"
          onClick={() => file && onSubmit(file)}
          disabled={!file}
        >
          트랜스크립트 생성
        </button>
      </footer>
    </div>
  );
}
