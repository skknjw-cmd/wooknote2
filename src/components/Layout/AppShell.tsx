"use client";

import React, { useState } from "react";
import NoteList from "@/components/Sidebar/NoteList";
import LiveTranscript from "@/components/Recording/LiveTranscript";
import NoteDocument from "@/components/NoteDoc/NoteDocument";
import ModelLoadingOverlay from "@/components/Layout/ModelLoadingOverlay";
import type { NoteRecord, Participant, TurnSegment } from "@/types/meeting";

interface AppShellProps {
  modelStatus: "idle" | "loading" | "ready";
  modelProgress: { whisper: number; speaker: number };
  currentNote: NoteRecord | null;
  notes: NoteRecord[];
  mode: "live" | "review";
  isRecording: boolean;
  elapsedMs: number;
  turns: TurnSegment[];
  keywords: { w: string; n: number; on?: boolean }[];
  participants: Participant[];
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onToggleRecording: () => void;
  onSpeakerName: (sp: number, name: string) => void;
  onToggleKeyword: (word: string) => void;
  onExport: () => void;
  onEditTurn: (id: number, newText: string) => void;
  onSplitTurn: (id: number, beforeText: string, afterText: string) => void;
  /** When provided, replaces the LiveTranscript pane with custom content */
  transcriptSlot?: React.ReactNode;
  pendingTurnCount?: number;
  onRegen?: () => void;
  onUpdateNote?: (note: NoteRecord) => void;
  onSettings?: () => void;
  analyzing?: boolean;
}

export default function AppShell({
  modelStatus,
  modelProgress,
  currentNote,
  notes,
  mode,
  isRecording,
  elapsedMs,
  turns,
  keywords,
  participants,
  onSelectNote,
  onNewNote,
  onToggleRecording,
  onSpeakerName,
  onToggleKeyword,
  onExport,
  onEditTurn,
  onSplitTurn,
  transcriptSlot,
  pendingTurnCount = 0,
  onRegen,
  onUpdateNote,
  onSettings,
  analyzing = false,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);

  const gridCols = collapsed ? "48px 1fr" : "240px 1fr";

  return (
    <div
      className="app2"
      style={{ gridTemplateColumns: gridCols, height: "100vh" }}
    >
      {/* Top bar */}
      <div className="topbar" style={{ gridColumn: "1 / -1" }}>
        <button
          className="icon-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "사이드바 열기" : "사이드바 닫기"}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="12" rx="2" />
            <line x1="6" y1="2" x2="6" y2="14" />
          </svg>
        </button>
        <span className="crumb">
          <span>전체 노트</span>
          <span className="crumb-sep">/</span>
          <span>오늘</span>
        </span>
        <input
          className="title-input"
          defaultValue={currentNote?.title || "새 노트"}
          key={currentNote?.id}
        />
        <div className="actions">
          {mode === "live" && isRecording && (
            <div className="live-pill">
              <span className="dot" />
              REC
            </div>
          )}
          {mode === "review" && (
            <button className="btn" onClick={onRegen}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 8a6 6 0 1 0 1.5-4" strokeLinecap="round" />
                <polyline points="1 4 2 8 6 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              다시 정리
            </button>
          )}
          <button className="icon-btn" title="복사">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="5" y="5" width="8" height="8" rx="1.5" />
              <path d="M3 11V3h8" strokeLinecap="round" />
            </svg>
          </button>
          <button className="icon-btn" title="내보내기" onClick={onExport}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 12h10" strokeLinecap="round" />
            </svg>
          </button>
          <button className="icon-btn" title="더 보기">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="4" cy="8" r="1" fill="currentColor" />
              <circle cx="8" cy="8" r="1" fill="currentColor" />
              <circle cx="12" cy="8" r="1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <NoteList
        notes={notes}
        currentId={currentNote?.id}
        collapsed={collapsed}
        onSelect={onSelectNote}
        onNew={onNewNote}
        onSettings={onSettings}
      />

      {/* Main area: transcript + note doc */}
      <div style={{ display: "flex", overflow: "hidden", position: "relative" }}>
        {mode === "review" && (
          <div className="review-banner" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
            <span className="ico">⏺</span>
            <span><b>녹음이 종료되었습니다.</b> AI 정리가 자동으로 갱신되었어요.</span>
            <div className="actions">
              <button className="btn" onClick={onToggleRecording}>이어 녹음</button>
              <button className="btn btn-primary" onClick={onExport}>저장</button>
            </div>
          </div>
        )}

        {/* 트랜스크립트 패널 */}
        <div style={{
          width: transcriptCollapsed ? 0 : 380,
          overflow: "hidden",
          transition: "width 0.2s ease",
          flexShrink: 0,
        }}>
          {transcriptSlot ?? (
            <LiveTranscript
              turns={turns}
              keywords={keywords}
              participants={participants}
              mode={mode}
              isRecording={isRecording}
              elapsedMs={elapsedMs}
              onToggleRecording={onToggleRecording}
              onSpeakerName={onSpeakerName}
              onToggleKeyword={onToggleKeyword}
              onEditTurn={onEditTurn}
              onSplitTurn={onSplitTurn}
              reviewOffset={mode === "review" ? 44 : 0}
            />
          )}
        </div>

        {/* 트랜스크립트 접기/펼치기 핸들 */}
        <button
          onClick={() => setTranscriptCollapsed((c) => !c)}
          title={transcriptCollapsed ? "트랜스크립트 펼치기" : "트랜스크립트 접기"}
          style={{
            flexShrink: 0,
            width: 16,
            alignSelf: "stretch",
            background: "var(--surface-2)",
            border: "none",
            borderLeft: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-4)",
            padding: 0,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        >
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {transcriptCollapsed
              ? <><polyline points="2,2 6,6 2,10" /></>
              : <><polyline points="6,2 2,6 6,10" /></>
            }
          </svg>
        </button>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            paddingTop: mode === "review" ? 44 : 0,
          }}
        >
          <NoteDocument
            note={currentNote}
            mode={mode}
            participants={participants}
            pendingTurnCount={pendingTurnCount}
            onRegen={onRegen}
            onUpdateNote={onUpdateNote}
            analyzing={analyzing}
          />
        </div>
      </div>

      {modelStatus !== "ready" && (
        <ModelLoadingOverlay status={modelStatus} progress={modelProgress} />
      )}
    </div>
  );
}
