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
import {
  getSttProvider,
  getApiKey,
  getOpenAiKey,
  getClovaUrl,
  getClovaSecretKey,
  apiKeyHeader,
  openAiKeyHeader,
  clovaKeyHeaders,
  hasApiKey,
  accumulateGeminiTokens,
} from "@/lib/apiKey";
import { chunkAudioFile } from "@/lib/audioChunk";
import { useOfflineSTT } from "@/hooks/useOfflineSTT";
import { saveNote as dbSave, getNotes as dbGetNotes } from "@/lib/db";
import { saveNoteToFolder, pickSaveFolder, getSaveFolderName } from "@/lib/folderStorage";
import { pushToNotion } from "@/lib/notionSave";
import type {
  NoteRecord,
  Participant,
  EntryMethod as InputMode,
  AnalysisResult,
  TurnSegment,
  DiscussionItem,
  NotionSaveState,
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

function parseDiscussion(title: string, description: string): DiscussionItem {
  const item: DiscussionItem = { title };
  const parts: Record<string, string[]> = { background: [], discussion: [], conclusion: [] };
  let current = "";
  for (const line of description.split("\n")) {
    if (/^배경[:：]/.test(line)) { current = "background"; parts.background.push(line.replace(/^배경[:：]\s*/, "")); }
    else if (/^논의[:：]/.test(line)) { current = "discussion"; parts.discussion.push(line.replace(/^논의[:：]\s*/, "")); }
    else if (/^결론[:：]/.test(line)) { current = "conclusion"; parts.conclusion.push(line.replace(/^결론[:：]\s*/, "")); }
    else if (current) { parts[current].push(line); }
  }
  if (parts.background.length) item.background = parts.background.join(" ").trim();
  if (parts.discussion.length) item.discussion = parts.discussion.join(" ").trim();
  if (parts.conclusion.length) item.conclusion = parts.conclusion.join(" ").trim();
  if (!item.background && !item.discussion && !item.conclusion) item.background = description;
  return item;
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

  const discussionSection = find("논의 내용", "논의내용", "맥락", "배경", "주요 논의");
  console.log("[applyAnalysis] discussionSection:", discussionSection?.name, "items:", discussionSection?.content?.length);
  const discussionItems = discussionSection?.type === "numbered"
    ? (Array.isArray(discussionSection.content) ? discussionSection.content : [])
        .filter((c) => c.title || c.description)
        .map((c) => parseDiscussion(c.title || "", c.description || ""))
    : undefined;
  console.log("[applyAnalysis] discussionItems:", discussionItems?.length, discussionItems?.[0]);

  return {
    ...note,
    title: result.title || note.title,
    summaryBullets: toStrings(find("핵심요약", "요약")),
    context: toStrings(find("논의 내용", "논의내용", "맥락", "배경")).join("\n\n") || note.context,
    discussions: discussionItems ?? note.discussions,
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

  const inputTokens = parseInt(res.headers.get("x-gemini-input-tokens") ?? "0", 10);
  const outputTokens = parseInt(res.headers.get("x-gemini-output-tokens") ?? "0", 10);
  if (inputTokens > 0 || outputTokens > 0) {
    accumulateGeminiTokens(inputTokens, outputTokens);
  }

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

  const [folderName, setFolderName] = useState<string | null>(null);

  const [pendingTurnCount, setPendingTurnCount] = useState(0);
  const prevTurnsLen = useRef(0);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioProgress, setAudioProgress] = useState<{ current: number; total: number } | undefined>();
  const [analyzing, setAnalyzing] = useState(false);
  const [notionStatus, setNotionStatus] = useState<NotionSaveState>({ kind: "idle" });
  const lastSavedNote = useRef<NoteRecord | null>(null);

  useEffect(() => {
    dbGetNotes().then((loaded) => { if (loaded.length) setNotes(loaded); });
    getSaveFolderName().then(setFolderName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function updateNoteState(updated: NoteRecord) {
    setCurrentNote(updated);
    setNotes((prev) => {
      const exists = prev.find((n) => n.id === updated.id);
      return exists ? prev.map((n) => (n.id === updated.id ? updated : n)) : [updated, ...prev];
    });
  }

  function saveNote(updated: NoteRecord) {
    updateNoteState(updated);
    dbSave(updated).catch(console.error);
    saveNoteToFolder(updated).catch(console.error);
  }

  /**
   * 입력이 끝난 노트를 확정 저장한다. 로컬(IndexedDB + 폴더)을 먼저 저장하고
   * 그다음 Notion으로 보낸다. Notion이 실패해도 회의 내용은 로컬에 남는다.
   */
  async function finalizeNote(note: NoteRecord) {
    saveNote(note);
    lastSavedNote.current = note;
    setNotionStatus({ kind: "saving" });
    setNotionStatus(await pushToNotion(note));
  }

  async function handleRetryNotion() {
    const note = lastSavedNote.current;
    if (!note) return;
    setNotionStatus({ kind: "saving" });
    setNotionStatus(await pushToNotion(note));
  }

  function handleSave() {
    if (currentNote) saveNote(currentNote);
  }

  async function handlePickFolder() {
    const name = await pickSaveFolder();
    if (name) setFolderName(name);
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
      updateNoteState(applyAnalysis({ ...note, participants, segments: turns }, result));
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
      const elapsedMs = stt.elapsedMs;
      await stt.stopRecording();
      setAppMode("review");
      if (currentNote) {
        // AI 분석은 하지 않는다. 사용자가 "다시 정리"를 누를 때만 실행된다.
        const turns = stt.getLatestTurns();
        await finalizeNote({
          ...currentNote,
          participants: stt.participants,
          segments: turns,
          audioDuration: elapsedMs,
        });
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
    // note.segments에 저장된 transcript 우선 사용, 없으면 live STT turns 사용
    const turns = (note.segments?.length ?? 0) > 0 ? note.segments! : stt.turns;
    const participants = stt.participants.length > 0 ? stt.participants : note.participants;
    await analyzeFromTurns(note, turns, participants);
  }

  // ── Text input mode ─────────────────────────────────────────────────────────

  async function handleTextSubmit(data: TextSubmitData) {
    const note = currentNote ?? emptyNote("text");
    if (!currentNote) setCurrentNote(note);

    // AI 분석 없이 바로 저장한다. 분석은 "다시 정리" 버튼에서만 실행된다.
    const textTurns = parseTextToTurns(data.text);
    await finalizeNote({
      ...note,
      segments: textTurns,
      title: data.title || note.title,
      meetingDate: data.date || note.meetingDate,
    });
    setAppMode("review");
    setScreen("live");
  }

  // ── Audio file upload mode ──────────────────────────────────────────────────

  async function handleAudioSubmit(file: File) {
    setAudioLoading(true);
    const note = currentNote ?? emptyNote("audio");
    if (!currentNote) setCurrentNote(note);
    try {
      const provider = getSttProvider();
      if (provider === "gemini" && !getApiKey()) {
        throw new Error("Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.");
      } else if (provider === "openai" && !getOpenAiKey()) {
        throw new Error("OpenAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.");
      } else if (provider === "clova" && (!getClovaUrl() || !getClovaSecretKey())) {
        throw new Error("Clova Speech API 설정이 불완전합니다. 설정에서 Invoke URL과 Secret Key를 확인해주세요.");
      }

      const texts: string[] = [];
      const allTurns: TurnSegment[] = [];
      let turnId = 0;
      let audioDurationMs = 0;

      if (provider === "clova") {
        // Vercel Serverless Function 페이로드 제한(4.5MB)을 회피하기 위해 파일을 120초(2분) 단위 WAV 청크로 나누어 전송합니다.
        const { chunks, durationMs } = await chunkAudioFile(file, 120);
        audioDurationMs = durationMs;
        console.log(`[audio] Clova Speech 분할 전송: ${file.name} → ${chunks.length}개 청크 (각 120초)`);
        setAudioProgress({ current: 0, total: chunks.length });

        for (let i = 0; i < chunks.length; i++) {
          const form = new FormData();
          form.append("media", chunks[i], `chunk_${i}.wav`);

          const res = await fetch("/api/stt", {
            method: "POST",
            headers: clovaKeyHeaders(),
            body: form,
          });

          if (!res.ok) {
            throw new Error(`Clova Speech API 청크 ${i + 1} 호출 실패 (${res.status}): ${await res.text()}`);
          }

          const sttJson = await res.json();
          const chunkText = sttJson.text ?? "";
          if (chunkText) texts.push(chunkText);

          const segs: { clovaLabel: string; text: string; start?: number }[] = sttJson.segments ?? [];
          const chunkOffsetSecs = i * 120; // 120초 단위 누적 오프셋
          for (const seg of segs) {
            const sp = parseInt(seg.clovaLabel) || 1;
            const startMs = typeof seg.start === "number" ? seg.start : 0;
            const absoluteSecs = chunkOffsetSecs + Math.floor(startMs / 1000);
            const mm = String(Math.floor(absoluteSecs / 60)).padStart(2, "0");
            const ss = String(absoluteSecs % 60).padStart(2, "0");
            allTurns.push({ id: turnId++, sp, t: `${mm}:${ss}`, text: seg.text });
          }
          setAudioProgress({ current: i + 1, total: chunks.length });
        }
      } else {
        // Gemini / OpenAI인 경우 파일을 120초(2분) 단위 WAV 청크로 분할하여 전송 (인식율 향상)
        const { chunks, durationMs } = await chunkAudioFile(file, 120);
        audioDurationMs = durationMs;
        console.log(`[audio] ${file.name} → ${chunks.length}개 청크 (각 120초)`);
        setAudioProgress({ current: 0, total: chunks.length });

        let prevContext: { sp: number; text: string }[] = [];
        const endpoint = provider === "openai" ? "/api/stt-openai" : "/api/stt-gemini";
        const headers = provider === "openai" ? openAiKeyHeader() : apiKeyHeader();

        for (let i = 0; i < chunks.length; i++) {
          const form = new FormData();
          form.append("media", chunks[i], `chunk_${i}.wav`);
          if (prevContext.length > 0) form.append("prevContext", JSON.stringify(prevContext));

          // 503/429 과부하 오류 시 최대 3회 재시도 (2s, 4s 대기)
          let sttRes = await fetch(endpoint, { method: "POST", headers, body: form });
          for (let attempt = 1; attempt < 3 && (sttRes.status === 503 || sttRes.status === 429); attempt++) {
            console.warn(`[audio] 청크 ${i + 1} ${sttRes.status} → ${attempt}회 재시도`);
            await new Promise((r) => setTimeout(r, attempt * 2000));
            sttRes = await fetch(endpoint, { method: "POST", headers, body: form });
          }
          if (!sttRes.ok) throw new Error(`STT 청크 ${i + 1} 실패 (${sttRes.status}): ${await sttRes.text()}`);
          const sttJson = await sttRes.json();
          const chunkText: string = sttJson.text ?? "";
          console.log(`[audio] 청크 ${i + 1}/${chunks.length}:`, chunkText.slice(0, 80));
          if (chunkText) texts.push(chunkText);

          // 세그먼트를 TurnSegment로 수집 (트랜스크립트 패널 표시용)
          const segs: { clovaLabel: string; text: string }[] = sttJson.segments ?? [];
          const chunkOffsetSecs = i * 120; // 120초 기준 누적 오프셋
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
      }

      // AI 분석 없이 바로 저장한다. 분석은 "다시 정리" 버튼에서만 실행된다.
      await finalizeNote({
        ...note,
        segments: allTurns,
        title: file.name.replace(/\.[^.]+$/, ""),
        audioDuration: audioDurationMs,
      });
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
        {showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} folderName={folderName} onPickFolder={handlePickFolder} notes={notes} />}
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
        sttError={stt.sttError}
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
        onSave={handleSave}
        onRegen={handleRegen}
        onEditTurn={stt.editTurn}
        onSplitTurn={stt.splitTurn}
        onUpdateNote={saveNote}
        onSettings={() => setShowApiKey(true)}
        analyzing={analyzing}
        folderName={folderName}
        onPickFolder={handlePickFolder}
      />
      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} onExport={handleExport} />
      )}
      {showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} folderName={folderName} onPickFolder={handlePickFolder} notes={notes} />}
    </>
  );
}
