"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Participant } from "@/types/meeting";
import { getSttProvider, apiKeyHeader, openAiKeyHeader, clovaKeyHeaders } from "@/lib/apiKey";
import { encodeWav } from "@/lib/audioChunk";
import type { RawSegment } from "@/lib/turnAssembly";

type ModelStatus = "idle" | "loading" | "ready";

/** 청크 하나의 STT 결과를 가공 없이 내보낸다. */
export type ChunkHandler = (chunk: { segments: RawSegment[]; chunkStartMs: number }) => void;

export type RecordingHandlers = {
  onChunk: ChunkHandler;
  /** STT 프롬프트의 화자 힌트에 쓸 현재 참석자. 훅은 이 값을 보관하지 않는다. */
  getParticipants: () => Participant[];
};

const CHUNK_MS = 15 * 1000;
// Vercel 서버리스 함수의 요청 본문 상한은 4.5MB다. 여유를 두고 4MB에서 자른다.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

interface STTState {
  modelStatus: ModelStatus;
  modelProgress: { whisper: number; speaker: number };
  isRecording: boolean;
  elapsedMs: number;
  sttError: string | null;
  recordingNoteId: string | null;
  startRecording: (noteId: string, handlers: RecordingHandlers) => Promise<void>;
  stopRecording: () => Promise<void>;
}

export function useOfflineSTT(): STTState {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sttError, setSttError] = useState<string | null>(null);

  /**
   * 아직 끝나지 않은 청크 처리들. 예전에는 Promise 하나를 청크마다 덮어쓰고 중지할 때
   * 그 마지막 하나만 기다렸다. STT가 청크 주기(15초)보다 오래 걸리면 청크가 겹쳐 날아가고,
   * 앞 청크의 응답이 clearSession() 뒤에 도착하면 onChunkRef가 이미 null이라 그 발화가
   * 조용히 사라졌다 — 회의 내용이 없어지는데 아무 말도 하지 않는다.
   * 전부 담아 두고 중지할 때 모두 기다린다.
   */
  const pendingChunksRef = useRef<Set<Promise<void>>>(new Set());

  /** 청크 처리를 등록하고 끝나면 스스로 빠진다. */
  function trackChunk(p: Promise<void>): Promise<void> {
    pendingChunksRef.current.add(p);
    void p.finally(() => pendingChunksRef.current.delete(p));
    return p;
  }

  /** 지금 날아가 있는 청크가 모두 끝날 때까지 기다린다. 하나가 실패해도 나머지를 기다린다. */
  async function drainChunks(): Promise<void> {
    // 기다리는 동안 새 청크가 들어올 수 있으므로(마지막 청크가 늦게 도착하는 경우)
    // 비워질 때까지 반복한다.
    while (pendingChunksRef.current.size > 0) {
      await Promise.allSettled([...pendingChunksRef.current]);
    }
  }
  // 청크 간 화자 레이블 연속성 유지: 모델이 반환한 "A","B","C" → 일관된 sp 번호
  // STT 프롬프트 힌트(prevContext)용으로도 쓰이므로 나중에 정리할 때 지우지 말 것
  const speakerLetterMapRef = useRef<Map<string, number>>(new Map());

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 지금 청크가 시작된 벽시계 시각. 스로틀된 타이머 대신 워치독이 이것으로 판단한다. */
  const chunkStartedAtRef = useRef(0);
  const isRecordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recordStartTimeRef = useRef(0);   // Date.now() 기반 — 스로틀링에 강함
  const elapsedMsRef = useRef(0);
  const prevContextRef = useRef<{ sp: number; text: string }[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [recordingNoteId, setRecordingNoteId] = useState<string | null>(null);
  const onChunkRef = useRef<ChunkHandler | null>(null);
  const getParticipantsRef = useRef<(() => Participant[]) | null>(null);

  // 화자 레이블(숫자 또는 문자)을 sp 번호로 변환한다.
  // 숫자 레이블(Gemini)이면 그대로, 문자 레이블(OpenAI "A","B")이면 speakerLetterMapRef로 누적 매핑.
  // prevContext 힌트 계산이 이 함수를 쓴다.
  function labelToSp(label: string): number {
    const parsed = parseInt(label, 10);
    if (!isNaN(parsed)) return parsed || 1;
    const letter = label.trim();
    if (!speakerLetterMapRef.current.has(letter)) {
      speakerLetterMapRef.current.set(letter, speakerLetterMapRef.current.size + 1);
    }
    return speakerLetterMapRef.current.get(letter)!;
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

      // 서버리스 함수 본문 상한(4.5MB)을 넘으면 요청 자체가 413으로 거부된다.
      // WAV는 무압축이라 16kHz mono에서 초당 32KB — 약 140초면 상한에 닿는다.
      // 그때는 원본 WebM(opus, 초당 약 8KB)을 그대로 보낸다. 변환본보다 인식률이
      // 조금 낮을 수 있지만, 통째로 잃는 것보다 낫다.
      if (sendBlob.size > MAX_UPLOAD_BYTES && blob.size < sendBlob.size) {
        console.warn(
          `[STT] WAV ${(sendBlob.size / 1048576).toFixed(1)}MB가 상한을 넘어 WebM 원본으로 보냄` +
          ` (${(blob.size / 1048576).toFixed(1)}MB)`,
        );
        sendBlob = blob;
      }
      if (sendBlob.size > MAX_UPLOAD_BYTES) {
        // 여기까지 오면 원본도 상한을 넘는다. 413의 원문을 그대로 보여 주면 사용자는
        // 무엇을 해야 할지 알 수 없으므로, 무슨 일이 일어났는지 말한다.
        setSttError(
          `이 구간 음성이 너무 커서 전송하지 못했습니다 (${(sendBlob.size / 1048576).toFixed(1)}MB).` +
          ` 녹음 탭을 화면 앞에 두면 구간이 짧게 잘립니다.`,
        );
        return;
      }

      const form = new FormData();
      form.append("media", sendBlob, sendBlob === blob ? "chunk.webm" : "chunk.wav");
      const roster = getParticipantsRef.current?.() ?? [];
      if (roster.length > 0) {
        form.append("attendeeCount", String(roster.length));
        const names = roster
          .filter((p) => p.name)
          .map((p) => `화자 ${p.sp}: ${p.name}`)
          .join(", ");
        if (names) form.append("speakerNames", names);
      }
      if (prevContextRef.current.length > 0) {
        form.append("prevContext", JSON.stringify(prevContextRef.current));
      }

      const provider = getSttProvider();
      let endpoint = "/api/stt-gemini";
      let headers = apiKeyHeader();

      if (provider === "openai") {
        endpoint = "/api/stt-openai";
        headers = openAiKeyHeader();
      } else if (provider === "clova") {
        endpoint = "/api/stt";
        headers = clovaKeyHeaders();
      }

      const hasKey = provider === "openai"
        ? Object.keys(openAiKeyHeader()).length > 0
        : provider === "clova"
        ? Object.keys(clovaKeyHeaders()).length > 0
        : Object.keys(apiKeyHeader()).length > 0;

      if (!hasKey) {
        const providerName = provider === "openai" ? "OpenAI" : provider === "clova" ? "Clova Speech" : "Gemini";
        setSttError(`${providerName} API 키가 설정되지 않았습니다. 우상단 설정에서 입력해주세요.`);
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

      // 가공 없이 내보낸다. 조립은 호출자(page.tsx)가 한다.
      onChunkRef.current?.({ segments, chunkStartMs });
      // 다음 청크의 화자 연속성 힌트. 조립된 발화 대신 가공 전 조각의 마지막 3개를 쓴다.
      prevContextRef.current = segments
        .slice(-3)
        .map((s) => ({ sp: labelToSp(s.clovaLabel), text: s.text }));
    } catch (err) {
      console.error("[STT] 처리 실패:", err);
      setSttError(`STT 처리 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 청크 시작 ───────────────────────────────────────────────
  function startChunk(stream: MediaStream) {
    const chunkStartMs = elapsedMsRef.current;
    // 벽시계로 기록한다. setTimeout은 배경 탭에서 스로틀되므로 이것만 믿을 수 있다.
    chunkStartedAtRef.current = Date.now();
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });

    recorder.ondataavailable = (e) => {
      if (e.data.size) trackChunk(processChunk(e.data, chunkStartMs));
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
  const startRecording = useCallback(async (noteId: string, handlers: RecordingHandlers) => {
    onChunkRef.current = handlers.onChunk;
    getParticipantsRef.current = handlers.getParticipants;
    setRecordingNoteId(noteId);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    isRecordingRef.current = true;
    recordStartTimeRef.current = Date.now();
    elapsedMsRef.current = 0;

    speakerLetterMapRef.current = new Map();
    // 새 녹음의 첫 청크가 이전 회의의 문맥을 프롬프트로 받지 않게 한다.
    prevContextRef.current = [];
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
        return;
      }
      // 청크 회전 타이머는 setTimeout이라 배경 탭에서 스로틀된다. 그대로 두면 청크
      // 하나가 몇 분짜리가 되어 WAV가 4.5MB 상한을 넘고 413으로 통째로 버려진다.
      // 벽시계로 재서 회전 시점이 지났으면 여기서 끊는다.
      if (Date.now() - chunkStartedAtRef.current >= CHUNK_MS) {
        console.warn("[STT] 워치독: 청크가 너무 길어 회전시킴");
        if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
        mediaRecorder.current.stop();
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

    // 세션 정체성(어느 노트를 녹음 중인가 · 청크를 누구에게 줄 것인가)은 녹음 1회 동안만
    // 유효하다. 마지막 청크가 핸들러에 닿은 뒤에 지워, 끝난 세션의 흔적이 남지 않게 한다.
    const clearSession = () => {
      setRecordingNoteId(null);
      onChunkRef.current = null;
      getParticipantsRef.current = null;
    };

    if (!recorder || recorder.state !== "recording") {
      stream?.getTracks().forEach((t) => t.stop());
      return drainChunks().then(clearSession);
    }

    return new Promise<void>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size) trackChunk(processChunk(e.data, elapsedMsRef.current));
      };
      recorder.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        await drainChunks();
        clearSession();
        resolve();
      };
      recorder.stop();
    });
  }, []);

  return {
    modelStatus: "ready",
    modelProgress: { whisper: 1, speaker: 1 },
    isRecording,
    recordingNoteId,
    elapsedMs,
    sttError,
    startRecording,
    stopRecording,
  };
}
