"use client";

import React, { useState } from "react";
import NoteList from "@/components/Sidebar/NoteList";
import LiveTranscript from "@/components/Recording/LiveTranscript";
import NoteDocument from "@/components/NoteDoc/NoteDocument";
import ModelLoadingOverlay from "@/components/Layout/ModelLoadingOverlay";
import type { NoteRecord, Participant, TurnSegment, NotionSaveState } from "@/types/meeting";

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
  onSave?: () => void;
  onEditTurn: (id: number, newText: string) => void;
  onSplitTurn: (id: number, beforeText: string, afterText: string) => void;
  /** When provided, replaces the LiveTranscript pane with custom content */
  transcriptSlot?: React.ReactNode;
  sttError?: string | null;
  pendingTurnCount?: number;
  onRegen?: () => void;
  onUpdateNote?: (note: NoteRecord) => void;
  onSettings?: () => void;
  analyzing?: boolean;
  folderName?: string | null;
  onPickFolder?: () => void;
  notionStatus?: NotionSaveState;
  onRetryNotion?: () => void;
  /** 지금 녹음 중인 노트. 보고 있는 노트와 다르면 상단에 안내를 띄운다. */
  recordingNoteId?: string | null;
  onGoToRecordingNote?: () => void;
}

/** 저장 상태를 배너 문구와 아이콘으로 옮긴다. */
function bannerText(status: NotionSaveState): { ico: string; text: React.ReactNode } {
  switch (status.kind) {
    case "saving":
      // 중지 직후의 마지막 음성 처리와 그 뒤의 저장을 한 문구로 덮는다. 두 단계 모두
      // "아직 저장되지 않았다"는 같은 사실을 말해야 하므로 Notion만 집어 말하지 않는다.
      return { ico: "⏳", text: <span><b>저장 중…</b> 마지막 음성을 처리하고 저장하는 중입니다.</span> };
    case "saved": {
      const parts: string[] = [];
      if (status.skippedProperties.length > 0) parts.push(`건너뛴 속성: ${status.skippedProperties.join(", ")}`);
      if (status.mappingIgnored) parts.push("매핑이 다른 데이터베이스의 것이라 무시했습니다 — 설정에서 다시 연결 테스트를 해주세요");
      // 이어 붙였는지 새로 만들었는지는 사용자가 Notion에서 무엇을 보게 될지를 바꾼다.
      // 페이지를 다시 만든 경우는 특히 알려야 한다 — 앞의 회의록이 사라졌다는 뜻이다.
      const where = status.pageRecreated
        ? "기존 페이지를 찾을 수 없어 새 페이지로 저장됨"
        : status.appended
          ? "기존 Notion 페이지에 이어 붙임"
          : "Notion에 기록됨";
      return {
        ico: status.pageRecreated ? "⚠️" : "✅",
        text: parts.length > 0
          ? <span><b>저장 완료</b> · {where} ({parts.join(" / ")})</span>
          : <span><b>저장 완료</b> · {where}</span>,
      };
    }
    case "partial":
      return {
        ico: "⚠️",
        text: (
          <span>
            <b>일부만 저장됨</b> ({status.savedBlocks}/{status.totalBlocks} 블록) ·{" "}
            {status.appended
              ? "다시 시도하면 이미 올라간 부분이 중복될 수 있습니다."
              : "다시 시도하면 새 페이지가 만들어집니다."}
          </span>
        ),
      };
    case "unconfigured":
      return { ico: "💾", text: <span><b>로컬에 저장됨</b> · Notion 미설정</span> };
    case "failed":
      return { ico: "❌", text: <span><b>Notion 저장 실패</b> · 로컬에는 저장됨 — {status.message}</span> };
    // 로컬(IndexedDB) 저장 자체가 실패해 이 회의는 어디에도 저장되지 않은 상태.
    // "저장됨"류 표현을 절대 쓰지 않는다 — 위험을 숨기면 안 된다.
    case "localFailed":
      return { ico: "❌", text: <span><b>저장 실패</b> — {status.message}</span> };
    default:
      return { ico: "⏺", text: <span><b>녹음이 종료되었습니다.</b></span> };
  }
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
  onSave,
  onEditTurn,
  onSplitTurn,
  transcriptSlot,
  sttError,
  pendingTurnCount = 0,
  onRegen,
  onUpdateNote,
  onSettings,
  analyzing = false,
  folderName,
  onPickFolder,
  notionStatus = { kind: "idle" },
  onRetryNotion,
  recordingNoteId = null,
  onGoToRecordingNote,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);

  const gridCols = collapsed ? "48px 1fr" : "240px 1fr";

  // 지금 보고 있는 노트가 실제로 녹음 중인가. 다른 노트를 녹음 중이면 이 패널은 녹음 상태가 아니다.
  const isRecordingThisNote = isRecording && (!recordingNoteId || currentNote?.id === recordingNoteId);

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
          {isRecording && (
            recordingNoteId && currentNote && recordingNoteId !== currentNote.id ? (
              <button
                type="button"
                className="live-pill"
                onClick={onGoToRecordingNote}
                title="녹음 중인 노트로 이동"
                style={{ border: "none", cursor: "pointer" }}
              >
                <span className="dot" />
                다른 노트 녹음 중 · 돌아가기
              </button>
            ) : (
              <div className="live-pill">
                <span className="dot" />
                REC
              </div>
            )
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
        folderName={folderName}
        onPickFolder={onPickFolder}
      />

      {/* Main area: transcript + note doc */}
      <div style={{ display: "flex", overflow: "hidden", position: "relative" }}>
        {mode === "review" && (() => {
          const { ico, text } = bannerText(notionStatus);
          // 저장에 성공한 뒤에도 다시 보낼 수 있어야 한다. 제목·참석자를 고친 뒤 이 버튼이
          // 없으면, 다시 녹음하기 전까지 Notion 페이지는 낡은 값을 그대로 달고 있는다.
          // (이어 붙일 발화가 없으므로 이 재전송은 속성만 갱신한다.)
          const canResend = notionStatus.kind === "saved" && !!notionStatus.pageId;
          const canRetry =
            notionStatus.kind === "failed" || notionStatus.kind === "partial" || canResend;
          return (
            <div className="review-banner" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
              <span className="ico">{ico}</span>
              {text}
              <div className="actions">
                <button className="btn" onClick={onToggleRecording}>이어 녹음</button>
                {canRetry && (
                  <button className="btn" onClick={onRetryNotion}>
                    {canResend ? "Notion 갱신" : "다시 시도"}
                  </button>
                )}
                {notionStatus.kind === "unconfigured" && (
                  <button className="btn" onClick={onSettings}>설정</button>
                )}
                <button className="btn" onClick={onExport}>내보내기</button>
                <button className="btn btn-primary" onClick={onSave}>저장</button>
              </div>
            </div>
          );
        })()}

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
              isRecording={isRecordingThisNote}
              elapsedMs={elapsedMs}
              sttError={sttError}
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
