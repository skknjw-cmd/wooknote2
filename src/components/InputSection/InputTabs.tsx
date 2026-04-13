import React, { useRef, useState, useEffect } from "react";
import styles from "./InputTabs.module.css";
import type { Segment, InputData } from "@/types/meeting";
import { resolveSegments } from "@/lib/speakerMapping";

const SEGMENT_DURATION_MS = 2 * 60 * 1000;

interface Props {
  value: InputData;
  onChange: (val: InputData) => void;
}

export default function InputTabs({ value, onChange }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [segmentCount, setSegmentCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentStartTimeRef = useRef<number>(0);
  const segmentRemainingRef = useRef<number>(SEGMENT_DURATION_MS);
  const transcribingCountRef = useRef(0);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const segmentsMapRef = useRef<Map<number, Segment[]>>(new Map());
  const sequenceCounterRef = useRef(0);
  const idCounterRef = useRef(0);
  const cumulativeOffsetMsRef = useRef(0);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleTabClick = (type: "text" | "file" | "record") => {
    if (isRecording) stopRecording();
    onChange({ type, content: type === "text" ? "" : null });
  };

  const getClovaHeaders = (): Record<string, string> => {
    const saved = localStorage.getItem("wooks_settings");
    const settings = saved ? JSON.parse(saved) : {};
    const headers: Record<string, string> = {};
    if (settings.clovaInvokeUrl) headers["x-clova-url"] = settings.clovaInvokeUrl;
    if (settings.clovaSecretKey) headers["x-clova-key"] = settings.clovaSecretKey;
    return headers;
  };

  const nextSegmentId = (): string => {
    idCounterRef.current += 1;
    return `seg_${String(idCounterRef.current).padStart(6, "0")}`;
  };

  const emitAllSegments = () => {
    const allSegments = Array.from(segmentsMapRef.current.entries())
      .sort(([a], [b]) => a - b)
      .flatMap(([, segs]) => segs);
    const content = resolveSegments(allSegments, {});
    onChangeRef.current({
      type: "record",
      content,
      segments: allSegments,
    });
  };

  const processSegment = async (
    blob: Blob,
    sequenceId: number,
    elapsedMs: number
  ) => {
    // Size check first — don't advance cumulative offset for empty/invalid blobs.
    if (blob.size < 1024) {
      const errorSegment: Segment = {
        id: nextSegmentId(),
        sequenceId,
        originalSpeaker: `${sequenceId}:?`,
        text: `[구간 변환 실패: 오디오 데이터가 너무 작습니다 (${blob.size} bytes)]`,
      };
      if (!segmentsMapRef.current.has(sequenceId)) {
        segmentsMapRef.current.set(sequenceId, [errorSegment]);
        emitAllSegments();
      }
      return;
    }

    transcribingCountRef.current += 1;
    setIsTranscribing(true);
    const offsetBase = cumulativeOffsetMsRef.current;
    cumulativeOffsetMsRef.current += elapsedMs;

    try {
      const formData = new FormData();
      formData.append("media", blob);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 50000);
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: getClovaHeaders(),
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errorData = await res.json();
          errMsg = errorData.details || errorData.error || errMsg;
        } catch {
          /* non-JSON */
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const incoming: Array<{
        clovaLabel: string;
        text: string;
        start?: number;
        end?: number;
      }> = Array.isArray(data.segments) ? data.segments : [];

      const newSegments: Segment[] = incoming.map((s) => ({
        id: nextSegmentId(),
        sequenceId,
        originalSpeaker: `${sequenceId}:${s.clovaLabel}`,
        text: s.text,
        start:
          typeof s.start === "number" ? offsetBase + s.start : undefined,
        end: typeof s.end === "number" ? offsetBase + s.end : undefined,
      }));

      segmentsMapRef.current.set(sequenceId, newSegments);
      emitAllSegments();
    } catch (err) {
      console.error("STT Segment Error:", err);
      const name = err instanceof Error && err.name === "AbortError"
        ? "요청 시간 초과 (50초)"
        : err instanceof Error
        ? err.message
        : "unknown";
      const errorSegment: Segment = {
        id: nextSegmentId(),
        sequenceId,
        originalSpeaker: `${sequenceId}:?`,
        text: `[구간 변환 실패: ${name}]`,
      };
      if (!segmentsMapRef.current.has(sequenceId)) {
        segmentsMapRef.current.set(sequenceId, [errorSegment]);
        emitAllSegments();
      }
    } finally {
      transcribingCountRef.current -= 1;
      if (transcribingCountRef.current <= 0) {
        transcribingCountRef.current = 0;
        setIsTranscribing(false);
      }
    }
  };

  const getSupportedMimeType = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  };

  const startSegment = (stream: MediaStream) => {
    const mimeType = getSupportedMimeType();
    const mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    sequenceCounterRef.current += 1;
    const thisSeq = sequenceCounterRef.current;
    const chunkStart = Date.now();

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: actualType });
      chunksRef.current = [];
      const elapsed = Date.now() - chunkStart;

      if (isRecordingRef.current) {
        setSegmentCount((prev) => prev + 1);
        startSegment(stream);
      } else {
        cleanupStream();
        setIsRecording(false);
      }

      if (blob.size >= 1024) {
        await processSegment(blob, thisSeq, elapsed);
      }
    };

    mediaRecorder.onerror = (event) => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      console.error("[REC] MediaRecorder error:", event);
      if (chunksRef.current.length > 0) {
        const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        chunksRef.current = [];
        if (blob.size >= 1024) {
          const elapsed = Date.now() - chunkStart;
          processSegment(blob, thisSeq, elapsed);
        }
      }
      if (!isRecordingRef.current) {
        cleanupStream();
        setIsRecording(false);
      }
    };

    mediaRecorder.start();

    segmentRemainingRef.current = SEGMENT_DURATION_MS;
    segmentStartTimeRef.current = Date.now();
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    segmentTimerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, SEGMENT_DURATION_MS);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      segmentsMapRef.current = new Map();
      sequenceCounterRef.current = 0;
      idCounterRef.current = 0;
      cumulativeOffsetMsRef.current = 0;
      isRecordingRef.current = true;
      setSegmentCount(1);
      onChangeRef.current({ type: "record", content: null, segments: [] });
      startSegment(stream);
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err);
      alert("마이크 접근 권한이 없거나 지원되지 않는 브라우저입니다.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      if (segmentTimerRef.current) {
        clearTimeout(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }
      const elapsed = Date.now() - segmentStartTimeRef.current;
      segmentRemainingRef.current = Math.max(
        0,
        segmentRemainingRef.current - elapsed
      );
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      segmentStartTimeRef.current = Date.now();
      segmentTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, segmentRemainingRef.current);
      setIsPaused(false);
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsPaused(false);
    if (segmentTimerRef.current) {
      clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupStream();
      setIsRecording(false);
      return;
    }
    try {
      recorder.requestData();
    } catch {
      /* ignore */
    }
    try {
      recorder.stop();
    } catch {
      cleanupStream();
      setIsRecording(false);
      return;
    }
    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    watchdogTimerRef.current = setTimeout(() => {
      console.warn("[REC] Watchdog: onstop이 5초 내 미발생. 강제 정리.");
      cleanupStream();
      setIsRecording(false);
      mediaRecorderRef.current = null;
    }, 5000);
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  let statusMsg = "버튼을 눌러 회의 녹음을 시작하세요";
  if (isPaused && isTranscribing) {
    statusMsg = `일시정지 중 (구간 ${segmentCount} / 이전 구간 변환 중)`;
  } else if (isPaused) {
    statusMsg = `일시정지 중 (구간 ${segmentCount}) — 재개 버튼을 눌러 계속하세요`;
  } else if (isRecording && isTranscribing) {
    statusMsg = `녹음 중... (구간 ${segmentCount} / 이전 구간 변환 중)`;
  } else if (isRecording) {
    statusMsg = `녹음 중... (구간 ${segmentCount} / 2분마다 자동 분할)`;
  } else if (isTranscribing) {
    statusMsg = "마지막 구간 텍스트 변환 중...";
  } else if (typeof value.content === "string" && value.content) {
    statusMsg = "녹음 및 변환 완료! 아래에서 화자 이름을 지정해보세요.";
  }

  return (
    <div>
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${value.type === "text" ? styles.active : ""}`}
          onClick={() => handleTabClick("text")}
        >
          직접 입력
        </button>
        <button
          className={`${styles.tabBtn} ${value.type === "file" ? styles.active : ""}`}
          onClick={() => handleTabClick("file")}
        >
          파일 업로드
        </button>
        <button
          className={`${styles.tabBtn} ${value.type === "record" ? styles.active : ""}`}
          onClick={() => handleTabClick("record")}
        >
          실시간 녹음
        </button>
      </div>

      <div className={styles.content}>
        {value.type === "text" && (
          <textarea
            className={styles.textarea}
            placeholder="회의 내용을 여기에 입력하세요..."
            value={typeof value.content === "string" ? value.content : ""}
            onChange={(e) =>
              onChange({ type: "text", content: e.target.value })
            }
          />
        )}

        {value.type === "file" && (
          <div className={styles.fileArea}>
            <p>음성 파일(mp3, m4a 등) 또는 텍스트 파일(txt, md)을 선택하세요.</p>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onChange({ type: "file", content: e.target.files[0] });
                }
              }}
            />
            <button
              className={styles.tabBtn}
              onClick={() => fileInputRef.current?.click()}
              style={{ backgroundColor: "var(--accent-base)", color: "#fff" }}
            >
              파일 선택하기
            </button>
            {value.content instanceof File && (
              <p style={{ marginTop: "1rem" }}>
                선택된 파일: {value.content.name}
              </p>
            )}
          </div>
        )}

        {value.type === "record" && (
          <div className={styles.recordArea}>
            <div className={styles.recordControls}>
              <p style={{ color: "var(--text-secondary)" }}>{statusMsg}</p>
              <div className={styles.recordBtns}>
                {isRecording && (
                  <button
                    className={`${styles.recordBtn} ${isPaused ? styles.paused : ""}`}
                    onClick={isPaused ? resumeRecording : pauseRecording}
                    title={isPaused ? "재개" : "일시정지"}
                  >
                    {isPaused ? "▶" : "⏸"}
                  </button>
                )}
                <button
                  className={`${styles.recordBtn} ${isRecording && !isPaused ? styles.recording : ""}`}
                  onClick={toggleRecording}
                  disabled={!isRecording && isTranscribing}
                  title={isRecording ? "정지" : "녹음 시작"}
                >
                  {isRecording ? "⏹" : isTranscribing ? "..." : "⏺"}
                </button>
              </div>
            </div>

            {(isTranscribing ||
              (typeof value.content === "string" && value.content)) && (
              <div style={{ marginTop: "1.5rem", width: "100%" }}>
                <label
                  className={styles.label}
                  style={{ marginBottom: "0.5rem", display: "block" }}
                >
                  변환된 내용 (확인 및 수정)
                </label>
                <textarea
                  className={styles.textarea}
                  placeholder={
                    isTranscribing
                      ? "텍스트 변환 중..."
                      : "변환된 내용이 여기에 표시됩니다."
                  }
                  value={typeof value.content === "string" ? value.content : ""}
                  onChange={(e) =>
                    onChange({
                      type: "record",
                      content: e.target.value,
                      segments: value.segments,
                      mapping: value.mapping,
                    })
                  }
                  style={{ minHeight: "150px" }}
                  readOnly={isTranscribing}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
