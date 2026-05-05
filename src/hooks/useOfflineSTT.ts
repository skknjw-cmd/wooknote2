"use client";

import { useState, useRef, useCallback } from "react";
import type { TurnSegment, Participant } from "@/types/meeting";

type ModelStatus = "idle" | "loading" | "ready";

// 30-second recording chunks → POST to /api/stt-gemini → Gemini 2.5 Flash STT + diarization
const CHUNK_MS = 15 * 1000;

interface STTState {
  modelStatus: ModelStatus;
  modelProgress: { whisper: number; speaker: number };
  isRecording: boolean;
  elapsedMs: number;
  turns: TurnSegment[];
  participants: Participant[];
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  updateSpeakerName: (sp: number, name: string) => void;
  setParticipants: (p: Participant[]) => void;
  editTurn: (id: number, newText: string) => void;
  splitTurn: (id: number, beforeText: string, afterText: string) => void;
}

export function useOfflineSTT(): STTState {
  // No model to load — Gemini API is always ready
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [turns, setTurns] = useState<TurnSegment[]>([]);
  const [participants, setParticipantsState] = useState<Participant[]>([]);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const elapsedMsRef = useRef(0);
  const participantsRef = useRef<Participant[]>([]);
  const segIdRef = useRef(0);

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  async function processChunk(blob: Blob, chunkStartMs: number) {
    if (!blob.size) return;
    try {
      const form = new FormData();
      form.append("media", blob);
      const headers: Record<string, string> = {};
      if (participantsRef.current.length > 0) {
        headers["x-attendee-count"] = String(participantsRef.current.length);
      }

      const res = await fetch("/api/stt-gemini", { method: "POST", body: form, headers });
      if (!res.ok) {
        console.error("[STT] Gemini 오류:", await res.text());
        return;
      }

      const { segments } = (await res.json()) as {
        segments: { clovaLabel: string; text: string }[];
      };
      if (!segments?.length) return;

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
        return next;
      });
    } catch (err) {
      console.error("[STT] 처리 실패:", err);
    }
  }

  function startChunk(stream: MediaStream) {
    const chunkStartMs = elapsedMsRef.current;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });

    recorder.ondataavailable = (e) => {
      if (e.data.size) processChunk(e.data, chunkStartMs);
    };

    recorder.onstop = () => {
      if (isRecordingRef.current && streamRef.current) {
        startChunk(streamRef.current);
      }
    };

    recorder.start();
    mediaRecorder.current = recorder;

    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, CHUNK_MS);
  }

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    isRecordingRef.current = true;
    elapsedMsRef.current = 0;

    startChunk(stream);

    setIsRecording(true);
    setElapsedMs(0);
    timerRef.current = setInterval(() => {
      elapsedMsRef.current += 1000;
      setElapsedMs((ms) => ms + 1000);
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    mediaRecorder.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
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

  const editTurn = useCallback((id: number, newText: string) => {
    setTurns((prev) => prev.map((t) => t.id === id ? { ...t, text: newText } : t));
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
    startRecording,
    stopRecording,
    updateSpeakerName,
    setParticipants,
    editTurn,
    splitTurn,
  };
}
