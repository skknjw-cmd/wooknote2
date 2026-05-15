"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TurnSegment, Participant } from "@/types/meeting";
import { getSttProvider, apiKeyHeader, openAiKeyHeader } from "@/lib/apiKey";
import { encodeWav } from "@/lib/audioChunk";

type ModelStatus = "idle" | "loading" | "ready";

const CHUNK_MS = 8 * 1000;

interface STTState {
  modelStatus: ModelStatus;
  modelProgress: { whisper: number; speaker: number };
  isRecording: boolean;
  elapsedMs: number;
  turns: TurnSegment[];
  participants: Participant[];
  sttError: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  getLatestTurns: () => TurnSegment[];
  updateSpeakerName: (sp: number, name: string) => void;
  setParticipants: (p: Participant[]) => void;
  editTurn: (id: number, newText: string) => void;
  splitTurn: (id: number, beforeText: string, afterText: string) => void;
}

export function useOfflineSTT(): STTState {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [turns, setTurns] = useState<TurnSegment[]>([]);
  const [participants, setParticipantsState] = useState<Participant[]>([]);
  const [sttError, setSttError] = useState<string | null>(null);

  const turnsRef = useRef<TurnSegment[]>([]);
  const lastChunkRef = useRef<Promise<void>>(Promise.resolve());

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recordStartTimeRef = useRef(0);   // Date.now() 기반 — 스로틀링에 강함
  const elapsedMsRef = useRef(0);
  const participantsRef = useRef<Participant[]>([]);
  const segIdRef = useRef(0);
  const prevContextRef = useRef<{ sp: number; text: string }[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  // ── Wake Lock ───────────────────────────────────────────────
  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as unknown as {
        wakeLock: { request: (type: string) => Promise<WakeLockSentinel> };
      }).wakeLock.request("screen");
      console.log("[STT] Wake lock 획득 — 화면 꺼짐 방지");
    } catch {
      console.warn("[STT] Wake lock 지원 안 됨 (iOS Safari 등)");
    }
  }

  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  // ── 청크 처리 ───────────────────────────────────────────────
  async function processChunk(blob: Blob, chunkStartMs: number) {
    if (!blob.size) return;
    try {
      let sendBlob = blob;
      try {
        const arrayBuf = await blob.arrayBuffer();
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
        await audioCtx.close();
        const pcm = audioBuf.getChannelData(0);
        sendBlob = new Blob([encodeWav(pcm, 16000)], { type: "audio/wav" });
      } catch {
        console.warn("[STT] WAV 변환 실패, WebM 원본 사용");
      }

      const form = new FormData();
      form.append("media", sendBlob, "chunk.wav");
      if (participantsRef.current.length > 0) {
        form.append("attendeeCount", String(participantsRef.current.length));
        const names = participantsRef.current
          .filter((p) => p.name)
          .map((p) => `화자 ${p.sp}: ${p.name}`)
          .join(", ");
        if (names) form.append("speakerNames", names);
      }
      if (prevContextRef.current.length > 0) {
        form.append("prevContext", JSON.stringify(prevContextRef.current));
      }

      const provider = getSttProvider();
      const endpoint = provider === "openai" ? "/api/stt-openai" : "/api/stt-gemini";
      const headers = provider === "openai" ? openAiKeyHeader() : apiKeyHeader();

      const hasKey = provider === "openai"
        ? Object.keys(openAiKeyHeader()).length > 0
        : Object.keys(apiKeyHeader()).length > 0;
      if (!hasKey) {
        setSttError(`${provider === "openai" ? "OpenAI" : "Gemini"} API 키가 설정되지 않았습니다. 우상단 설정에서 입력해주세요.`);
        return;
      }

      const res = await fetch(endpoint, { method: "POST", body: form, headers });
      if (!res.ok) {
        const errText = await res.text();
        console.error("[STT] API 오류:", errText);
        setSttError(`STT 오류 (${res.status}): ${errText.slice(0, 120)}`);
        return;
      }

      const json = (await res.json()) as {
        segments: { clovaLabel: string; text: string }[];
        _raw?: string;
      };
      const { segments } = json;
      if (!segments?.length) {
        if (json._raw) setSttError(`[진단] 모델 출력: "${json._raw}"`);
        else setSttError(null);
        return;
      }
      setSttError(null);

      const newContext: { sp: number; text: string }[] = [];
      setTurns((prev) => {
        const next = [...prev];
        for (const seg of segments) {
          if (!seg.text?.trim()) continue;
          const sp = parseInt(seg.clovaLabel, 10) || 1;
          const last = next[next.length - 1];
          if (last && last.sp === sp) {
            next[next.length - 1] = { ...last, text: last.text + " " + seg.text.trim() };
          } else {
            next.push({
              id: ++segIdRef.current,
              sp,
              t: formatTime(chunkStartMs),
              text: seg.text.trim(),
            });
          }
        }
        newContext.push(...next.slice(-3).map((t) => ({ sp: t.sp, text: t.text })));
        turnsRef.current = next;
        return next;
      });
      prevContextRef.current = newContext;
    } catch (err) {
      console.error("[STT] 처리 실패:", err);
      setSttError(`STT 처리 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 청크 시작 ───────────────────────────────────────────────
  function startChunk(stream: MediaStream) {
    const chunkStartMs = elapsedMsRef.current;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });

    recorder.ondataavailable = (e) => {
      if (e.data.size) lastChunkRef.current = processChunk(e.data, chunkStartMs);
    };

    recorder.onstop = () => {
      if (isRecordingRef.current && streamRef.current) {
        // 스트림 트랙이 살아있을 때만 다음 청크 시작
        const alive = streamRef.current.getTracks().some((t) => t.readyState === "live");
        if (alive) startChunk(streamRef.current);
      }
    };

    recorder.start();
    mediaRecorder.current = recorder;

    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, CHUNK_MS);
  }

  // ── visibilitychange: 화면 복귀 시 녹음 상태 복구 ───────────
  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (!isRecordingRef.current) return;

      console.log("[STT] 화면 복귀 — 녹음 상태 점검");

      // Date.now() 기반으로 실제 경과 시간 업데이트 (스로틀 보정)
      const actualElapsed = Date.now() - recordStartTimeRef.current;
      elapsedMsRef.current = actualElapsed;
      setElapsedMs(actualElapsed);

      // Wake Lock 재획득 (화면 복귀 시 자동 해제됨)
      if (!wakeLockRef.current) {
        await acquireWakeLock();
      }

      // 스트림 트랙이 살아있는데 recorder가 멈췄으면 재시작
      const stream = streamRef.current;
      if (!stream) return;
      const alive = stream.getTracks().some((t) => t.readyState === "live");
      if (!alive) {
        console.warn("[STT] 마이크 스트림 종료됨 — 재획득 필요 (사용자 제스처 필요)");
        return;
      }

      const recorderState = mediaRecorder.current?.state;
      if (recorderState !== "recording") {
        console.warn("[STT] 녹음기 비활성 — 청크 재시작");
        if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
        startChunk(stream);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 녹음 시작 ───────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    isRecordingRef.current = true;
    recordStartTimeRef.current = Date.now();
    elapsedMsRef.current = 0;

    startChunk(stream);
    await acquireWakeLock();

    setIsRecording(true);
    setElapsedMs(0);

    // Date.now() 기반 타이머 — 스로틀링과 무관하게 정확한 시간 표시
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - recordStartTimeRef.current;
      elapsedMsRef.current = elapsed;
      setElapsedMs(elapsed);
    }, 1000);

    // 워치독: 5초마다 녹음기 상태 점검, 멈췄으면 재시작
    watchdogRef.current = setInterval(() => {
      if (!isRecordingRef.current || !streamRef.current) return;
      const alive = streamRef.current.getTracks().some((t) => t.readyState === "live");
      if (!alive) return; // 스트림 자체가 끊기면 복구 불가
      if (mediaRecorder.current?.state !== "recording") {
        console.warn("[STT] 워치독: 녹음기 재시작");
        if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
        startChunk(streamRef.current);
      }
    }, 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 녹음 중지 ───────────────────────────────────────────────
  const stopRecording = useCallback((): Promise<void> => {
    isRecordingRef.current = false;
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    releaseWakeLock();

    const recorder = mediaRecorder.current;
    const stream = streamRef.current;
    streamRef.current = null;

    if (!recorder || recorder.state !== "recording") {
      stream?.getTracks().forEach((t) => t.stop());
      return lastChunkRef.current;
    }

    return new Promise<void>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size) lastChunkRef.current = processChunk(e.data, elapsedMsRef.current);
      };
      recorder.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        await lastChunkRef.current;
        resolve();
      };
      recorder.stop();
    });
  }, []);

  const updateSpeakerName = useCallback((sp: number, name: string) => {
    setParticipantsState((prev) => {
      const existing = prev.find((p) => p.sp === sp);
      if (existing) return prev.map((p) => p.sp === sp ? { ...p, name, initials: name[0] } : p);
      return [...prev, { sp, name, role: "", initials: name[0] }];
    });
  }, []);

  const setParticipants = useCallback((p: Participant[]) => {
    participantsRef.current = p;
    setParticipantsState(p);
  }, []);

  const getLatestTurns = useCallback(() => turnsRef.current, []);

  const editTurn = useCallback((id: number, newText: string) => {
    setTurns((prev) => {
      const next = prev.map((t) => t.id === id ? { ...t, text: newText } : t);
      turnsRef.current = next;
      return next;
    });
  }, []);

  const splitTurn = useCallback((id: number, beforeText: string, afterText: string) => {
    setTurns((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const newId = ++segIdRef.current;
      const next = [...prev];
      next.splice(idx, 1,
        { ...original, text: beforeText },
        { id: newId, sp: original.sp, t: original.t, text: afterText }
      );
      turnsRef.current = next;
      return next;
    });
  }, []);

  return {
    modelStatus: "ready",
    modelProgress: { whisper: 1, speaker: 1 },
    isRecording,
    elapsedMs,
    turns,
    participants,
    sttError,
    startRecording,
    stopRecording,
    getLatestTurns,
    updateSpeakerName,
    setParticipants,
    editTurn,
    splitTurn,
  };
}
