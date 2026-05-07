"use client";

import React, { useState, useRef, useEffect } from "react";
import AppShell from "@/components/Layout/AppShell";
import ModeSelect from "@/components/Layout/ModeSelect";
import PreMeetingRoster from "@/components/Speaker/PreMeetingRoster";
import TextInputPanel from "@/components/Recording/TextInputPanel";
import type { TextSubmitData } from "@/components/Recording/TextInputPanel";
import AudioFilePanel from "@/components/Recording/AudioFilePanel";
import VideoPanel from "@/components/Recording/VideoPanel";
import ExportModal from "@/components/NoteDoc/ExportModal";
import ApiKeyModal from "@/components/Layout/ApiKeyModal";
import {
  exportAsMarkdown,
  exportAsPDF,
  exportAsDocx,
  exportAsAudio,
} from "@/lib/exportNote";
import { apiKeyHeader, hasApiKey } from "@/lib/apiKey";
import { chunkAudioFile } from "@/lib/audioChunk";
import { useOfflineSTT } from "@/hooks/useOfflineSTT";
import type {
  NoteRecord,
  Participant,
  EntryMethod as InputMode,
  AnalysisResult,
  TurnSegment,
} from "@/types/meeting";

type AppScreen = "mode-select" | "roster" | "live" | "text" | "audio" | "video";

function emptyNote(method?: InputMode): NoteRecord {
  return {
    id: crypto.randomUUID(),
    title: "새 노트",
    createdAt: Date.now(),
    entryMethod: method,
    segments: [],
    speakerMapping: {},
    participants: [],
    audioDuration: 0,
    keywords: [],
    memo: "",
    summaryBullets: [],
    actions: [],
    decisions: [],
    questions: [],
    nextAgenda: [],
    context: "",
  };
}

// 텍스트 → TurnSegment 파싱 ([화자 N] 또는 "이름: 내용" 또는 단순 줄바꿈)
function parseTextToTurns(text: string): TurnSegment[] {
  const turns: TurnSegment[] = [];
  let id = 0;
  const speakerMap = new Map<string, number>();
  let nextSp = 1;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const geminiM = trimmed.match(/^\[화자\s*(\w+)\]\s*(.+)$/);
    if (geminiM) {
      turns.push({ id: id++, sp: parseInt(geminiM[1]) || 1, t: "", text: geminiM[2].trim() });
      continue;
    }

    const colonM = trimmed.match(/^([^:]{1,15}):\s*(.+)$/);
    if (colonM) {
      const name = colonM[1].trim();
      if (!speakerMap.has(name)) speakerMap.set(name, nextSp++);
      turns.push({ id: id++, sp: speakerMap.get(name)!, t: "", text: colonM[2].trim() });
      continue;
    }

    turns.push({ id: id++, sp: 1, t: "", text: trimmed });
  }
  return turns;
}

// AnalysisResult sections → NoteRecord 필드 매핑
function applyAnalysis(note: NoteRecord, result: AnalysisResult): NoteRecord {
  const sections = result.sections ?? [];

  console.log("[applyAnalysis] sections:", sections.map((s) => `${s.name}(${s.type},${s.content?.length ?? 0})`));

  // 정확한 이름 우선, 부분 일치 후순위. "결정"만으로 매칭하면 "미결정사항"에 잘못 걸림.
  function find(...keywords: string[]) {
    return sections.find((s) => keywords.some((k) => s.name.includes(k)));
  }

  function toStrings(section: AnalysisResult["sections"][number] | undefined): string[] {
    if (!section || section.type !== "numbered") return [];
    const content = Array.isArray(section.content) ? section.content : [];
    return content
      .map((c) => (c.title && c.description ? `${c.title}: ${c.description}` : c.title || c.description || ""))
      .filter(Boolean);
  }

  const todoSection = find("To-Do", "실행과제", "할 일");
  const actions =
    todoSection?.type === "table"
      ? todoSection.content
          .filter((c) => c.task)
          .map((c) => ({ what: c.task, who: c.owner ?? "", when: c.due ?? "", done: false, notes: c.notes || "" }))
      : [];

  const decisions = toStrings(find("주요 결정사항", "결정사항"));
  const questions = toStrings(find("미결정사항", "미결정", "미해결"));
  const nextAgenda = toStrings(find("향후 일정", "일정"));

  console.log("[applyAnalysis] decisions:", decisions, "actions:", actions.length, "questions:", questions, "nextAgenda:", nextAgenda);

  return {
    ...note,
    title: result.title || note.title,
    summaryBullets: toStrings(find("핵심요약", "요약")),
    context: toStrings(find("논의 내용", "논의내용", "맥락", "배경")).join("\n\n") || note.context,
    decisions,
    actions,
    questions,
    nextAgenda,
  };
}

// /api/analyze 호출 공통 함수
async function callAnalyze(
  content: string,
  meetingInfo: { title: string; date: string; attendees: string }
): Promise<AnalysisResult> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeyHeader() },
    body: JSON.stringify({
      meetingInfo,
      selectedOptions: ["핵심요약", "주요 논의 내용", "주요 결정사항", "실행과제 (To-Do List)", "미결정사항", "향후 일정"],
      content,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function Home() {
  const stt = useOfflineSTT();

  const [screen, setScreen] = useState<AppScreen>("mode-select");
  const [appMode, setAppMode] = useState<"live" | "review">("live");
  const [showExport, setShowExport] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [keywords, setKeywords] = useState<{ w: string; n: number; on?: boolean }[]>([]);
  const [currentNote, setCurrentNote] = useState<NoteRecord | null>(null);
  const [notes, setNotes] = useState<NoteRecord[]>([]);

  const [pendingTurnCount, setPendingTurnCount] = useState(0);
  const prevTurnsLen = useRef(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioProgress, setAudioProgress] = useState<{ current: number; total: number } | undefined>();
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const added = stt.turns.length - prevTurnsLen.current;
    if (added > 0) {
      prevTurnsLen.current = stt.turns.length;
      setPendingTurnCount((n) => n + added);
    }
  }, [stt.turns.length]);

  function resetPending() {
    setPendingTurnCount(0);
    prevTurnsLen.current = stt.turns.length;
  }

  function saveNote(updated: NoteRecord) {
    setCurrentNote(updated);
    setNotes((prev) => {
      const exists = prev.find((n) => n.id === updated.id);
      return exists ? prev.map((n) => (n.id === updated.id ? updated : n)) : [updated, ...prev];
    });
  }

  // ── Mode selection ──────────────────────────────────────────────────────────

  function handleModeSelect(m: InputMode) {
    if (m === "live") {
      setScreen("roster");
    } else {
      setCurrentNote(emptyNote(m));
      setScreen(m as AppScreen);
    }
  }

  function handleOpenNote(id: string) {
    const note = notes.find((n) => n.id === id);
    if (note) {
      setCurrentNote(note);
      setAppMode("review");
      setScreen("live");
    }
  }

  // ── Roster (live mode setup) ────────────────────────────────────────────────

  async function handleStart(roster: Participant[]) {
    const note = emptyNote("live");
    stt.setParticipants(roster);
    setCurrentNote({ ...note, participants: roster });
    setKeywords([]);
    setAppMode("live");
    resetPending();
    setScreen("live");
    try {
      await stt.startRecording();
    } catch {
      alert("마이크 접근 권한이 필요합니다.");
      setScreen("roster");
    }
  }

  async function handleSkip() {
    setCurrentNote(emptyNote("live"));
    setKeywords([]);
    setAppMode("live");
    resetPending();
    setScreen("live");
    try {
      await stt.startRecording();
    } catch {
      alert("마이크 접근 권한이 필요합니다.");
      setScreen("mode-select");
    }
  }

  // ── Live 녹음 분석 ──────────────────────────────────────────────────────────

  async function analyzeFromTurns(note: NoteRecord, turns: TurnSegment[], participants: Participant[]) {
    console.log("[analyze] turns:", turns.length, "hasKey:", hasApiKey());
    if (turns.length === 0) {
      alert("트랜스크립트가 없어 AI 분석을 건너뜁니다.");
      return;
    }
    if (!hasApiKey()) {
      alert("Gemini API 키가 설정되지 않았습니다.\n우상단 설정에서 API 키를 입력해주세요.");
      return;
    }

    const transcript = turns.map((t) => {
      const p = participants.find((p) => p.sp === t.sp);
      const label = p?.name || `화자 ${t.sp}`;
      return `[${label}] ${t.text}`;
    }).join("\n");

    const meetingInfo = {
      title: note.title,
      date: new Date(note.createdAt).toLocaleDateString("ko-KR"),
      attendees: participants.length > 0
        ? participants.map((p) => p.name || `화자 ${p.sp}`).join(", ")
        : "미정",
    };

    setAnalyzing(true);
    try {
      const result = await callAnalyze(transcript, meetingInfo);
      saveNote(applyAnalysis({ ...note, participants }, result));
    } catch (err) {
      console.error("[analyze] 실패:", err);
      alert("AI 분석 중 오류가 발생했습니다.\n" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Recording controls ──────────────────────────────────────────────────────

  async function handleToggleRecording() {
    if (stt.isRecording) {
      stt.stopRecording();
      setAppMode("review");
      if (currentNote) {
        await analyzeFromTurns(currentNote, stt.turns, stt.participants);
      }
    } else {
      stt.startRecording().catch(console.error);
      setAppMode("live");
    }
  }

  function handleToggleKeyword(word: string) {
    setKeywords((kws) => kws.map((k) => k.w === word ? { ...k, on: !k.on } : k));
  }

  // ── AI 재정리 ───────────────────────────────────────────────────────────────

  async function handleRegen() {
    resetPending();
    const note = currentNote ?? emptyNote("live");
    await analyzeFromTurns(note, stt.turns, stt.participants);
  }

  // ── Text input mode ─────────────────────────────────────────────────────────

  async function handleTextSubmit(data: TextSubmitData) {
    const note = currentNote ?? emptyNote("text");
    if (!currentNote) setCurrentNote(note);
    if (!hasApiKey()) {
      alert("Gemini API 키가 설정되지 않았습니다.\n우상단 설정에서 API 키를 입력해주세요.");
      return;
    }
    setAnalyzing(true);
    try {
      const result = await callAnalyze(data.text, {
        title: data.title,
        date: data.date || new Date().toLocaleDateString("ko-KR"),
        attendees: "미정",
      });
      const textTurns = parseTextToTurns(data.text);
      saveNote(applyAnalysis({ ...note, segments: textTurns, title: data.title || note.title }, result));
      setAppMode("review");
      setScreen("live");
    } catch (err) {
      console.error("분석 실패:", err);
      alert("AI 분석 중 오류가 발생했습니다.\n" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Audio file upload mode ──────────────────────────────────────────────────

  async function handleAudioSubmit(file: File) {
    setAudioLoading(true);
    const note = currentNote ?? emptyNote("audio");
    if (!currentNote) setCurrentNote(note);
    try {
      if (!hasApiKey()) {
        throw new Error("Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.");
      }

      // 파일을 30초 WAV 청크로 분할 (413 오류 방지)
      const chunks = await chunkAudioFile(file);
      console.log(`[audio] ${file.name} → ${chunks.length}개 청크`);
      setAudioProgress({ current: 0, total: chunks.length });

      const texts: string[] = [];
      const allTurns: TurnSegment[] = [];
      let turnId = 0;
      let prevContext: { sp: number; text: string }[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const form = new FormData();
        form.append("media", chunks[i], `chunk_${i}.wav`);
        if (prevContext.length > 0) form.append("prevContext", JSON.stringify(prevContext));

        // 503/429 과부하 오류 시 최대 3회 재시도 (2s, 4s 대기)
        let sttRes = await fetch("/api/stt-gemini", { method: "POST", headers: apiKeyHeader(), body: form });
        for (let attempt = 1; attempt < 3 && (sttRes.status === 503 || sttRes.status === 429); attempt++) {
          console.warn(`[audio] 청크 ${i + 1} ${sttRes.status} → ${attempt}회 재시도`);
          await new Promise((r) => setTimeout(r, attempt * 2000));
          sttRes = await fetch("/api/stt-gemini", { method: "POST", headers: apiKeyHeader(), body: form });
        }
        if (!sttRes.ok) throw new Error(`STT 청크 ${i + 1} 실패 (${sttRes.status}): ${await sttRes.text()}`);
        const sttJson = await sttRes.json();
        const chunkText: string = sttJson.text ?? "";
        console.log(`[audio] 청크 ${i + 1}/${chunks.length}:`, chunkText.slice(0, 80));
        if (chunkText) texts.push(chunkText);

        // 세그먼트를 TurnSegment로 수집 (트랜스크립트 패널 표시용)
        const segs: { clovaLabel: string; text: string }[] = sttJson.segments ?? [];
        const chunkOffsetSecs = i * 60;
        for (const seg of segs) {
          const sp = parseInt(seg.clovaLabel) || 1;
          const mm = String(Math.floor(chunkOffsetSecs / 60)).padStart(2, "0");
          const ss = String(chunkOffsetSecs % 60).padStart(2, "0");
          allTurns.push({ id: turnId++, sp, t: `${mm}:${ss}`, text: seg.text });
        }

        // 다음 청크의 화자 연속성을 위한 컨텍스트 유지
        prevContext = segs.slice(-3).map((s) => ({ sp: parseInt(s.clovaLabel) || 1, text: s.text }));

        setAudioProgress({ current: i + 1, total: chunks.length });
      }

      const transcript = texts.join("\n");
      const result = await callAnalyze(transcript, {
        title: file.name.replace(/\.[^.]+$/, ""),
        date: new Date().toLocaleDateString("ko-KR"),
        attendees: "미정",
      });
      const updated = applyAnalysis({ ...note, segments: allTurns, title: file.name.replace(/\.[^.]+$/, "") }, result);
      saveNote(updated);
      setAppMode("review");
      setScreen("live");
    } catch (err) {
      console.error("[audio] 변환 실패:", err);
      alert("변환 중 오류가 발생했습니다.\n" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAudioLoading(false);
      setAudioProgress(undefined);
    }
  }

  // ── Video meeting mode ──────────────────────────────────────────────────────

  function handleVideoConnect(data: { platform: string; url: string }) {
    console.log("화상 회의 연결:", data);
    alert(`${data.platform} 연결은 준비 중입니다.`);
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  async function handleExport(
    format: string,
    options: { includeTranscript: boolean; includeAiSummary: boolean },
  ) {
    setShowExport(false);
    if (!currentNote) return;
    const turns = stt.turns;
    const opts = options;
    try {
      if (format === "md") exportAsMarkdown(currentNote, turns, opts);
      else if (format === "pdf") exportAsPDF(currentNote, turns, opts);
      else if (format === "docx") await exportAsDocx(currentNote, turns, opts);
      else if (format === "audio") exportAsAudio(currentNote);
    } catch (err) {
      console.error("내보내기 실패:", err);
      alert("내보내기 중 오류가 발생했습니다.");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (screen === "mode-select") {
    return (
      <>
        <ModeSelect
          onSelect={handleModeSelect}
          recentNotes={notes}
          onOpenNote={handleOpenNote}
          onSettings={() => setShowApiKey(true)}
        />
        {showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} />}
      </>
    );
  }

  if (screen === "roster") {
    return (
      <>
        <PreMeetingRoster onStart={handleStart} onSkip={handleSkip} onBack={() => setScreen("mode-select")} />
        {showExport && (
          <ExportModal onClose={() => setShowExport(false)} onExport={handleExport} />
        )}
      </>
    );
  }

  if (screen === "text") {
    return <TextInputPanel onSubmit={handleTextSubmit} onBack={() => setScreen("mode-select")} loading={analyzing} />;
  }

  if (screen === "audio") {
    return <AudioFilePanel onSubmit={handleAudioSubmit} onBack={() => setScreen("mode-select")} loading={audioLoading} progress={audioProgress} />;
  }

  if (screen === "video") {
    return <VideoPanel onSubmit={handleVideoConnect} onBack={() => setScreen("mode-select")} />;
  }

  return (
    <>
      <AppShell
        modelStatus={stt.modelStatus}
        modelProgress={stt.modelProgress}
        currentNote={currentNote}
        notes={notes}
        mode={appMode}
        isRecording={stt.isRecording}
        elapsedMs={stt.elapsedMs}
        turns={currentNote?.entryMethod === "live" || !currentNote?.entryMethod ? stt.turns : (currentNote?.segments ?? [])}
        keywords={keywords}
        participants={stt.participants}
        pendingTurnCount={pendingTurnCount}
        onSelectNote={handleOpenNote}
        onNewNote={() => setScreen("mode-select")}
        onToggleRecording={handleToggleRecording}
        onSpeakerName={stt.updateSpeakerName}
        onToggleKeyword={handleToggleKeyword}
        onExport={() => setShowExport(true)}
        onRegen={handleRegen}
        onEditTurn={stt.editTurn}
        onSplitTurn={stt.splitTurn}
        onUpdateNote={saveNote}
        onSettings={() => setShowApiKey(true)}
        analyzing={analyzing}
      />
      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} onExport={handleExport} />
      )}
      {showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} />}
    </>
  );
}
