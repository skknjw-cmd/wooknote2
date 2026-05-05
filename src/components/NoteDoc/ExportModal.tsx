"use client";

import React, { useState } from "react";

interface ExportModalProps {
  onClose: () => void;
  onExport: (format: string, options: { includeTranscript: boolean; includeAiSummary: boolean }) => void;
}

const FORMATS = [
  { id: "pdf", label: "PDF", ext: ".pdf", desc: "공유 · 인쇄 최적화" },
  { id: "md", label: "Markdown", ext: ".md", desc: "AI 호환 · 제목/단락 구조 유지" },
  { id: "docx", label: "Word", ext: ".docx", desc: "MS Office · 편집 가능" },
  { id: "audio", label: "원본 오디오", ext: ".m4a", desc: "녹음 파일 그대로 저장" },
];

export default function ExportModal({ onClose, onExport }: ExportModalProps) {
  const [fmt, setFmt] = useState("pdf");
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [includeAiSummary, setIncludeAiSummary] = useState(true);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <h3>내보내기</h3>
        <p className="sub">형식을 선택하여 노트를 저장하세요.</p>

        <div className="fmt-grid">
          {FORMATS.map((f) => (
            <div
              key={f.id}
              className={`fmt-card${fmt === f.id ? " on" : ""}`}
              onClick={() => setFmt(f.id)}
            >
              <div className="fmt-h">
                {f.label}
                <span className="ext">{f.ext}</span>
              </div>
              <div className="fmt-d">{f.desc}</div>
            </div>
          ))}
        </div>

        <div className="opt-row">
          <input
            type="checkbox"
            id="inc-tr"
            checked={includeTranscript}
            onChange={(e) => setIncludeTranscript(e.target.checked)}
          />
          <label htmlFor="inc-tr">트랜스크립트 포함</label>
        </div>
        <div className="opt-row">
          <input
            type="checkbox"
            id="inc-ai"
            checked={includeAiSummary}
            onChange={(e) => setIncludeAiSummary(e.target.checked)}
          />
          <label htmlFor="inc-ai">AI 요약 포함</label>
        </div>

        <div className="actions">
          <button className="btn" onClick={onClose}>취소</button>
          <button
            className="btn btn-primary"
            onClick={() => onExport(fmt, { includeTranscript, includeAiSummary })}
          >
            내보내기
          </button>
        </div>
      </div>
    </div>
  );
}
