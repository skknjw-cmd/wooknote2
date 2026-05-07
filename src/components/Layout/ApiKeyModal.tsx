"use client";

import React, { useState } from "react";
import { getApiKey, setApiKey } from "@/lib/apiKey";
import { isFolderPickerSupported } from "@/lib/folderStorage";

interface ApiKeyModalProps {
  /** true면 닫기 불가 (최초 설정) */
  required?: boolean;
  onClose: () => void;
  folderName?: string | null;
  onPickFolder?: () => void;
}

export default function ApiKeyModal({ required = false, onClose, folderName, onPickFolder }: ApiKeyModalProps) {
  const [value, setValue] = useState(getApiKey());
  const [saved, setSaved] = useState(false);
  const [show, setShow] = useState(false);

  function handleSave() {
    setApiKey(value);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  }

  const masked = value
    ? show
      ? value
      : value.slice(0, 6) + "•".repeat(Math.max(0, value.length - 10)) + value.slice(-4)
    : "";

  return (
    <div className="modal-bg" onClick={required ? undefined : onClose}>
      <div className="api-key-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #ede9fe, #fce7f3)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#7c3aed" strokeWidth="1.6">
              <circle cx="6" cy="7" r="4" />
              <path d="M10 11l4 4" strokeLinecap="round" />
              <path d="M6 5v4M4 7h4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Gemini API 키 설정</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>AI 요약 및 STT 기능에 사용됩니다</div>
          </div>
          {!required && (
            <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" />
              </svg>
            </button>
          )}
        </div>

        {/* Input */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AIzaSy..."
            style={{
              width: "100%", padding: "9px 40px 9px 12px", fontSize: 13,
              border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
              background: "var(--surface)", color: "var(--ink)", outline: "none",
              fontFamily: "var(--font-mono)", boxSizing: "border-box",
            }}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && handleSave()}
            autoFocus
          />
          <button
            onClick={() => setShow((s) => !s)}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)",
              padding: 2,
            }}
            title={show ? "숨기기" : "보기"}
          >
            {show ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
                <circle cx="8" cy="8" r="2" />
                <line x1="2" y1="2" x2="14" y2="14" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
            )}
          </button>
        </div>

        {/* Guide */}
        <div style={{
          fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6,
          background: "var(--surface-2)", borderRadius: "var(--r-sm)",
          padding: "8px 10px", marginBottom: 16,
        }}>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--info)", fontWeight: 600, textDecoration: "none" }}
          >
            Google AI Studio
          </a>
          에서 무료로 발급받을 수 있습니다.
          키는 이 브라우저에만 저장되며 서버로 전송되지 않습니다.
        </div>

        {/* Folder picker (Chrome/Edge only) */}
        {isFolderPickerSupported() && (
          <div style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 14, marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8 }}>
              저장 폴더
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13 }}>📁</span>
              <span style={{ fontSize: 13, color: folderName ? "var(--ink)" : "var(--ink-4)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {folderName ?? "미지정"}
              </span>
              <button className="btn" onClick={onPickFolder} style={{ flexShrink: 0, fontSize: 12, padding: "5px 10px" }}>
                폴더 선택
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6 }}>
              노트 저장 시 지정 폴더에 마크다운 파일(.md)로 자동 저장됩니다.
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {!required && (
            <button className="btn" onClick={onClose}>취소</button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!value.trim() || saved}
            style={{ minWidth: 80 }}
          >
            {saved ? "저장됨 ✓" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
