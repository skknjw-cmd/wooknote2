"use client";

import React, { useState } from "react";
import NoteList from "@/components/Sidebar/NoteList";
import LiveTranscript from "@/components/Recording/LiveTranscript";
import ActionBar from "@/components/Layout/ActionBar";
import AnalysisView from "@/components/Analysis/AnalysisView";
import MeetingInfoPanel from "@/components/NoteDoc/MeetingInfoPanel";
import NotionStatusPanel from "@/components/Notion/NotionStatusPanel";
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

/**
 * 헤더 칩에 쓸 한 마디 요약.
 *
 * NotionStatusPanel의 bannerText를 끌어다 쓰지 않는다 — 저쪽은 한 문장짜리 설명이라
 * 칩 한 칸에 들어가지 않는다. 자세한 사정(어디에 저장됐는지, 다시 시도하면 무슨 일이
 * 생기는지)은 칩을 눌러 여는 오른쪽 패널이 말한다. 아이콘만 같은 것을 쓴다.
 *
 * notionPageId를 같이 받는 이유는 아래 기본 분기 주석 참고.
 */
function statusChip(status: NotionSaveState, notionPageId?: string): { ico: string; label: string } {
  switch (status.kind) {
    case "saving":
      return { ico: "⏳", label: "저장 중…" };
    case "saved":
      return { ico: status.pageRecreated ? "⚠️" : "✅", label: "저장됨" };
    case "partial":
      return { ico: "⚠️", label: "일부 저장" };
    case "unconfigured":
      return { ico: "💾", label: "미설정" };
    case "failed":
      return { ico: "❌", label: "실패" };
    // 로컬 저장까지 실패한 경우 — "저장됨"류 표현을 쓰지 않는다.
    case "localFailed":
      return { ico: "❌", label: "로컬도 실패" };
    // idle은 세션 상태라 노트를 바꿀 때마다 초기화된다(page.tsx handleOpenNote). 노트에
    // notionPageId가 남아 있으면 그 노트는 이미 Notion에 있다 — 여기서 "저장 전"이라고 하면
    // 오른쪽 패널의 [Notion에서 열기] 링크와 헤더 칩이 서로 다른 말을 하게 된다.
    default:
      return notionPageId ? { ico: "✅", label: "저장됨" } : { ico: "⏺", label: "저장 전" };
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const gridCols = collapsed ? "48px 1fr" : "240px 1fr";

  // 지금 보고 있는 노트가 실제로 녹음 중인가. 다른 노트를 녹음 중이면 이 패널은 녹음 상태가 아니다.
  const isRecordingThisNote = isRecording && (!recordingNoteId || currentNote?.id === recordingNoteId);

  const chip = statusChip(notionStatus, currentNote?.notionPageId);

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
        <input
          className="title-input"
          defaultValue={currentNote?.title || "새 노트"}
          placeholder="제목 없음"
          // key에 제목을 넣는 이유: 이 입력칸은 비제어(defaultValue)라서, 본문에서
          // 제목이 바뀌어도 스스로 다시 그리지 않는다. 제목이 바뀔 때 remount 시켜
          // 두 입력구가 서로 다른 제목을 보여주는 일을 막는다.
          // 주의: key는 이 입력칸의 자체 blur뿐 아니라, [다시 정리]가 분석 결과로
          // 받아온 새 제목이 반영될 때도 바뀐다(page.tsx의 applyAnalysis → title:
          // result.title). 후자는 callAnalyze를 몇 초간 기다린 뒤 비동기로 오므로,
          // 그 사이 이 입력칸에 포커스를 두고 타이핑 중이었다면 remount로 입력 중이던
          // 글자가 그대로 날아간다.
          key={`${currentNote?.id}:${currentNote?.title}`}
          onBlur={(e) => {
            const note = currentNote;
            if (!note) return;
            const next = e.currentTarget.value.trim();
            // 빈 제목으로 지워버리면 Notion 페이지 제목이 사라진다. 비우면 원래대로 둔다.
            if (!next || next === note.title) {
              e.currentTarget.value = note.title;
              return;
            }
            onUpdateNote?.({ ...note, title: next });
          }}
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
            // 분석을 바로 돌리지 않고 화면부터 연다 — 결과를 볼 곳이 있어야 누른 보람이
            // 있다. 실제 분석은 AnalysisView 안의 버튼이 onRegen으로 돌린다.
            <button className="btn" onClick={() => setAnalysisOpen(true)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 8a6 6 0 1 0 1.5-4" strokeLinecap="round" />
                <polyline points="1 4 2 8 6 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              다시 정리
            </button>
          )}
          <button
            type="button"
            className="notion-chip"
            onClick={() => setPanelCollapsed(false)}
            title="저장 상태 자세히 보기"
          >
            <span className="ico">{chip.ico}</span>
            {chip.label}
          </button>
          <button className="icon-btn" title="내보내기" onClick={onExport}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 12h10" strokeLinecap="round" />
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

      {/* Main area: 트랜스크립트가 주인공, 오른쪽에 정보 패널 */}
      <div className="main-area">
        <div className="main-row">
          {/* 트랜스크립트 — 남는 폭 전부 */}
          <div className="transcript-col">
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
              />
            )}
          </div>

          {/* 오른쪽 패널 접기/펼치기 핸들 */}
          <button
            className="panel-handle"
            onClick={() => setPanelCollapsed((c) => !c)}
            title={panelCollapsed ? "정보 패널 펼치기" : "정보 패널 접기"}
          >
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {panelCollapsed
                ? <polyline points="6,2 2,6 6,10" />
                : <polyline points="2,2 6,6 2,10" />
              }
            </svg>
          </button>

          {/* 오른쪽 패널 — 폭은 접힘 상태에서 계산되므로 인라인으로 둔다 */}
          <div
            className={panelCollapsed ? "side-panel collapsed" : "side-panel"}
            style={{ width: panelCollapsed ? 0 : 320 }}
          >
            <MeetingInfoPanel
              note={currentNote}
              participants={participants}
              onUpdateNote={onUpdateNote}
            />
            <NotionStatusPanel
              status={notionStatus}
              notionPageId={currentNote?.notionPageId}
              syncedTurns={currentNote?.notionSyncedTurns}
              totalTurns={currentNote?.segments.length ?? 0}
              onRetry={onRetryNotion}
              onSettings={onSettings}
              onOpenAnalysis={() => setAnalysisOpen(true)}
              analyzing={analyzing}
            />
          </div>
        </div>

        <ActionBar
          mode={mode}
          onToggleRecording={onToggleRecording}
          onExport={onExport}
          onSave={onSave}
        />
      </div>

      {analysisOpen && (
        <AnalysisView
          note={currentNote}
          pendingTurnCount={pendingTurnCount}
          analyzing={analyzing}
          onRegen={onRegen}
          onUpdateNote={onUpdateNote}
          onClose={() => setAnalysisOpen(false)}
        />
      )}

      {modelStatus !== "ready" && (
        <ModelLoadingOverlay status={modelStatus} progress={modelProgress} />
      )}
    </div>
  );
}
