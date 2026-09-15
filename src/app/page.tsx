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
import { assembleTurns, nextSpeakerBase, type RawSegment } from "@/lib/turnAssembly";
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

  // ── 녹음 세션 상태 (녹음 1회 동안만 유효) ──
  const recordingSegmentsRef = useRef<TurnSegment[]>([]);
  const recordingParticipantsRef = useRef<Participant[]>([]);
  // 녹음 중인 노트 자체를 들고 있는다. 중지 시 저장 대상은 화면에 떠 있는 노트가 아니라
  // 이 노트다. notes에서 id로 찾으면 사용자가 다른 노트를 보고 있을 때 엉뚱한 노트가 잡힌다.
  const recordingNoteRef = useRef<NoteRecord | null>(null);
  const sessionLetterMap = useRef<Map<string, number>>(new Map());
  const sessionSpeakerBase = useRef(1);
  const sessionBaseMs = useRef(0);
  const sessionFirstChunk = useRef(true);
  // 중지 처리 중인가. stopRecording()은 isRecording을 곧바로 false로 만들지만,
  // 반환하는 프라미스는 마지막 청크의 STT 왕복이 끝날 때까지(수 초) 기다린다.
  // 그동안 토글을 다시 누르면 새 녹음이 시작돼 세션 ref를 갈아엎고, 먼저 진입한
  // 중지가 두 번째 녹음의 발화를 첫 번째 노트에 확정 저장한 뒤 ref를 비워
  // 두 번째 회의가 통째로 사라진다. 그 재진입을 막는다.
  const stoppingRef = useRef(false);

  useEffect(() => {
    dbGetNotes().then((loaded) => { if (loaded.length) setNotes(loaded); });
    getSaveFolderName().then(setFolderName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const len = currentNote?.segments.length ?? 0;
    const added = len - prevTurnsLen.current;
    if (added > 0) {
      prevTurnsLen.current = len;
      setPendingTurnCount((n) => n + added);
    }
  }, [currentNote?.segments.length]);

  function resetPending() {
    setPendingTurnCount(0);
    prevTurnsLen.current = currentNote?.segments.length ?? 0;
  }

  function updateNoteState(updated: NoteRecord) {
    setCurrentNote(updated);
    setNotes((prev) => {
      const exists = prev.find((n) => n.id === updated.id);
      return exists ? prev.map((n) => (n.id === updated.id ? updated : n)) : [updated, ...prev];
    });
  }

  /**
   * 특정 노트의 발화를 갱신하고 저장한다. 그 노트가 지금 녹음 중이면 세션 ref도 함께 맞춘다.
   * ref를 맞추지 않으면 다음 청크가 사용자의 편집을 덮어쓴다.
   *
   * 저장까지 하는 이유: 사이드바에서 연 노트의 발화를 고친 뒤 다른 노트로 넘어가면
   * state만 바꾼 편집은 그대로 사라진다. (청크 조립 경로는 여기를 쓰지 않는다 —
   * 15초마다 IndexedDB에 쓰는 것은 낭비고, 확정 저장은 finalizeNote가 한다.)
   */
  function applySegments(noteId: string, segments: TurnSegment[]) {
    if (stt.recordingNoteId === noteId) {
      recordingSegmentsRef.current = segments;
      if (recordingNoteRef.current) {
        recordingNoteRef.current = { ...recordingNoteRef.current, segments };
      }
    }
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, segments } : n)));
    setCurrentNote((cur) => (cur && cur.id === noteId ? { ...cur, segments } : cur));

    // 반쪽짜리 객체를 저장하지 않도록, 저장할 노트는 최신 노트 객체 위에 segments만 얹어 만든다.
    const base =
      notes.find((n) => n.id === noteId) ??
      (currentNote && currentNote.id === noteId ? currentNote : undefined);
    if (base) dbSave({ ...base, segments }).catch(console.error);
  }

  /** 청크 하나가 도착했을 때 녹음 중인 노트에 조립해 넣는다. */
  function handleChunk(noteId: string, chunk: { segments: RawSegment[]; chunkStartMs: number }) {
    const isFirst = sessionFirstChunk.current;
    sessionFirstChunk.current = false;

    const next = assembleTurns(recordingSegmentsRef.current, chunk.segments, {
      baseMs: sessionBaseMs.current,
      chunkStartMs: chunk.chunkStartMs,
      letterMap: sessionLetterMap.current,
      speakerBase: sessionSpeakerBase.current,
      isFirstChunkOfSession: isFirst,
    });

    recordingSegmentsRef.current = next;
    if (recordingNoteRef.current) {
      recordingNoteRef.current = { ...recordingNoteRef.current, segments: next };
    }
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, segments: next } : n)));
    setCurrentNote((cur) => (cur && cur.id === noteId ? { ...cur, segments: next } : cur));
  }

  /** 녹음 세션 ref를 노트 기준으로 초기화하고 훅을 시작한다. */
  async function beginRecording(note: NoteRecord) {
    recordingSegmentsRef.current = note.segments ?? [];
    recordingParticipantsRef.current = note.participants ?? [];
    recordingNoteRef.current = note;
    sessionLetterMap.current = new Map();
    sessionSpeakerBase.current = nextSpeakerBase(note.segments ?? []);
    sessionBaseMs.current = note.audioDuration ?? 0;
    sessionFirstChunk.current = true;

    await stt.startRecording(note.id, {
      onChunk: (chunk) => handleChunk(note.id, chunk),
      getParticipants: () => recordingParticipantsRef.current,
    });
  }

  function handleEditTurn(id: number, newText: string) {
    const note = currentNote;
    if (!note) return;
    applySegments(note.id, note.segments.map((t) => (t.id === id ? { ...t, text: newText } : t)));
  }

  function handleSplitTurn(id: number, beforeText: string, afterText: string) {
    const note = currentNote;
    if (!note) return;
    const idx = note.segments.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const original = note.segments[idx];
    const newId = Math.max(0, ...note.segments.map((t) => t.id)) + 1;
    const next = [...note.segments];
    next.splice(idx, 1,
      { ...original, text: beforeText },
      { id: newId, sp: original.sp, t: original.t, text: afterText },
    );
    applySegments(note.id, next);
  }

  function handleSpeakerName(sp: number, name: string) {
    const note = currentNote;
    if (!note) return;
    const existing = note.participants.find((p) => p.sp === sp);
    const participants = existing
      ? note.participants.map((p) => (p.sp === sp ? { ...p, name, initials: name[0] ?? "" } : p))
      : [...note.participants, { sp, name, role: "", initials: name[0] ?? "" }];

    if (stt.recordingNoteId === note.id) {
      recordingParticipantsRef.current = participants;
    }
    const updated = { ...note, participants };
    updateNoteState(updated);
    dbSave(updated).catch(console.error);
  }

  function saveNote(updated: NoteRecord) {
    updateNoteState(updated);
    dbSave(updated).catch(console.error);
    saveNoteToFolder(updated).catch(console.error);
  }

  /**
   * 입력이 끝난 노트를 확정 저장한다.
   *
   * 순서 보장: IndexedDB 쓰기를 **await로 성공을 확인한 뒤에만** Notion을 시도한다.
   * 따라서 Notion 단계의 배너가 "로컬에는 저장됨"이라고 말할 때 그 말은 언제나 참이다.
   * 로컬 저장이 실패하면 Notion은 건드리지 않고 로컬 실패를 그대로 알린다.
   * (폴더 .md 쓰기는 사용자가 폴더를 고르지 않았을 수 있는 best-effort라 기다리지 않는다.)
   */
  async function finalizeNote(note: NoteRecord) {
    updateNoteState(note);
    saveNoteToFolder(note).catch(console.error);

    try {
      await dbSave(note);
    } catch (err) {
      console.error("[finalize] 로컬 저장 실패:", err);
      setNotionStatus({
        kind: "localFailed",
        message:
          "로컬(IndexedDB) 저장에 실패해 Notion 저장을 건너뜁니다. 회의 내용이 이 브라우저에 남지 않으니 지금 내보내기로 파일을 받아두세요.",
      });
      return;
    }

    setNotionStatus({ kind: "saving" });
    setNotionStatus(await pushToNotion(note));
  }

  async function handleRetryNotion() {
    // handleOpenNote가 노트 전환 시 notionStatus를 idle로 되돌리므로, 상태가 idle이 아닌 동안
    // currentNote는 방금 저장한 그 노트다. 화자명 수정 등 이후 편집까지 반영해 다시 올린다.
    const note = currentNote;
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
    if (!note) return;
    setCurrentNote(note);
    // 이 노트가 지금 녹음 중인 노트라면 live로, 아니면 review로 연다.
    setAppMode(stt.isRecording && stt.recordingNoteId === id ? "live" : "review");
    setScreen("live");
    // 노트를 바꾸면 이전 노트의 Notion 저장 상태가 남아 오해를 부르므로 초기화한다.
    setNotionStatus({ kind: "idle" });
    // 새 발화 배지는 "이 노트에서 새로 늘어난 발화" 수다. 노트를 바꾸면 길이가
    // 통째로 달라지므로 기준선을 여기서 다시 잡아야 사용자가 이미 본 발화가
    // 새 발화로 세어지지 않는다.
    prevTurnsLen.current = note.segments.length;
    setPendingTurnCount(0);
  }

  // ── Roster (live mode setup) ────────────────────────────────────────────────

  async function handleStart(roster: Participant[]) {
    const note = { ...emptyNote("live"), participants: roster };
    // 녹음 중인 노트도 목록에 넣는다. 그래야 사이드바에 보이고, 청크가 도착할 때
    // setNotes의 map이 이 노트를 찾아 발화를 채울 수 있다.
    updateNoteState(note);
    setKeywords([]);
    setAppMode("live");
    // resetPending()은 이 렌더의 currentNote(= 직전에 보던 노트)를 읽으므로 새 노트에서는
    // 기준선이 어긋난다. 새 노트의 발화는 0개이므로 여기서 직접 0으로 잡는다.
    setPendingTurnCount(0);
    prevTurnsLen.current = 0;
    setScreen("live");
    try {
      await beginRecording(note);
    } catch {
      alert("마이크 접근 권한이 필요합니다.");
      setScreen("roster");
    }
  }

  async function handleSkip() {
    const note = emptyNote("live");
    updateNoteState(note);
    setKeywords([]);
    setAppMode("live");
    // handleStart와 같은 이유로 기준선을 직접 잡는다.
    setPendingTurnCount(0);
    prevTurnsLen.current = 0;
    setScreen("live");
    try {
      await beginRecording(note);
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
      // 이미 중지 처리 중이면 아무것도 하지 않는다.
      if (stoppingRef.current) return;
      stoppingRef.current = true;
      const elapsedMs = stt.elapsedMs;
      // 라이브 모드는 await 전에 벗어난다. 마지막 청크를 기다리는 수 초 동안
      // 화면이 계속 "녹음 중"처럼 보이면 사용자가 다시 누르게 된다.
      setAppMode("review");
      try {
        await stt.stopRecording();

        // 저장 대상은 화면에 떠 있는 노트가 아니라 녹음하던 노트다. 사용자가 녹음 중
        // 다른 노트를 열어 보고 있었다면 currentNote는 남의 노트이고, 그걸 확정 저장하면
        // IndexedDB·.md·Notion까지 엉뚱한 내용이 나간다.
        const rec = recordingNoteRef.current;
        if (!rec) return;
        // 녹음하던 노트의 최신본을 목록에서 가져온다. 녹음 중 제목·메모·To-Do를 고쳤다면
        // 그 편집이 여기 들어 있다. 녹음이 소유한 필드만 그 위에 덮어쓴다.
        const latest = notes.find((n) => n.id === rec.id) ?? rec;
        // AI 분석은 하지 않는다. 사용자가 "다시 정리"를 누를 때만 실행된다.
        await finalizeNote({
          ...latest,
          segments: recordingSegmentsRef.current,
          participants: recordingParticipantsRef.current,
          audioDuration: sessionBaseMs.current + elapsedMs,
        });

        // 세션 ref는 녹음 1회 동안만 유효하다. 비워 두지 않으면 두 번째 중지가
        // 이미 끝난 녹음을 대상으로 다시 확정 저장한다.
        recordingNoteRef.current = null;
        recordingSegmentsRef.current = [];
        recordingParticipantsRef.current = [];
      } finally {
        // 중간에 무엇이 실패해도 가드가 걸린 채로 남지 않게 한다.
        stoppingRef.current = false;
      }
    } else {
      // 중지가 끝나기 전에 새 녹음을 시작하면 세션 ref를 갈아엎어 중지 중인 녹음을 잃는다.
      if (stoppingRef.current) return;
      // 동시 녹음은 지원하지 않는다. 이미 다른 노트를 녹음 중이면 거부한다.
      if (stt.isRecording) {
        alert("이미 다른 노트를 녹음 중입니다. 먼저 그 녹음을 종료해주세요.");
        return;
      }
      const note = currentNote;
      if (!note) return;
      beginRecording(note).catch(console.error);
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
    // 발화의 단일 소스는 노트다. 훅의 세션 버퍼는 더 이상 읽지 않는다.
    const turns = note.segments ?? [];
    const participants = note.participants ?? [];
    await analyzeFromTurns(note, turns, participants);
  }

  // ── Text input mode ─────────────────────────────────────────────────────────

  async function handleTextSubmit(data: TextSubmitData) {
    const note = currentNote ?? emptyNote("text");
    if (!currentNote) setCurrentNote(note);

    // AI 분석 없이 바로 저장한다. 분석은 "다시 정리" 버튼에서만 실행된다.
    // 여기서 analyzing은 AI 호출이 아니라 finalizeNote의 Notion 저장 진행 상태를 나타낸다
    // (버튼 스피너 표시 + 중복 클릭으로 인한 Notion 페이지 중복 생성 방지).
    const textTurns = parseTextToTurns(data.text);
    setAnalyzing(true);
    try {
      await finalizeNote({
        ...note,
        segments: textTurns,
        title: data.title || note.title,
        meetingDate: data.date || note.meetingDate,
      });
    } finally {
      setAnalyzing(false);
    }
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
    const turns = currentNote.segments ?? [];
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
        turns={currentNote?.segments ?? []}
        keywords={keywords}
        participants={currentNote?.participants ?? []}
        pendingTurnCount={pendingTurnCount}
        onSelectNote={handleOpenNote}
        onNewNote={() => setScreen("mode-select")}
        onToggleRecording={handleToggleRecording}
        onSpeakerName={handleSpeakerName}
        onToggleKeyword={handleToggleKeyword}
        onExport={() => setShowExport(true)}
        onSave={handleSave}
        onRegen={handleRegen}
        onEditTurn={handleEditTurn}
        onSplitTurn={handleSplitTurn}
        onUpdateNote={saveNote}
        onSettings={() => setShowApiKey(true)}
        analyzing={analyzing}
        folderName={folderName}
        onPickFolder={handlePickFolder}
        notionStatus={notionStatus}
        onRetryNotion={handleRetryNotion}
        recordingNoteId={stt.recordingNoteId}
        onGoToRecordingNote={() => { if (stt.recordingNoteId) handleOpenNote(stt.recordingNoteId); }}
      />
      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} onExport={handleExport} />
      )}
      {showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} folderName={folderName} onPickFolder={handlePickFolder} notes={notes} />}
    </>
  );
}
