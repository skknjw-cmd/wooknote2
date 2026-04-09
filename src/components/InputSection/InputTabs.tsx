import React, { useRef, useState, useEffect } from "react";
import styles from "./InputTabs.module.css";

const SEGMENT_DURATION_MS = 2 * 60 * 1000; // 2분

type InputData = {
  type: "text" | "file" | "record";
  content: string | File | Blob | null;
};

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
  const accumulatedTextRef = useRef("");
  // onChange를 ref로 관리해 비동기 콜백에서 항상 최신 값 사용
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  const handleTabClick = (type: "text" | "file" | "record") => {
    if (isRecording) stopRecording();
    onChange({ type, content: type === "text" ? "" : null });
  };

  const getClovaHeaders = (): Record<string, string> => {
    const savedSettings = localStorage.getItem("wooks_settings");
    const settings = savedSettings ? JSON.parse(savedSettings) : {};
    const headers: Record<string, string> = {};
    if (settings.clovaInvokeUrl) headers["x-clova-url"] = settings.clovaInvokeUrl;
    if (settings.clovaSecretKey) headers["x-clova-key"] = settings.clovaSecretKey;
    return headers;
  };

  const processSegment = async (blob: Blob) => {
    setIsTranscribing(true);
    console.log(`[STT] 세그먼트 처리 시작 - 크기: ${(blob.size / 1024).toFixed(1)}KB, 타입: ${blob.type}`);
    try {
      if (blob.size < 1024) {
        throw new Error(`오디오 데이터가 너무 작습니다 (${blob.size} bytes)`);
      }

      const formData = new FormData();
      formData.append("media", blob);

      const res = await fetch("/api/stt", {
        method: "POST",
        headers: getClovaHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.details || errorData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.text) {
        accumulatedTextRef.current = accumulatedTextRef.current
          ? `${accumulatedTextRef.current}\n${data.text}`
          : data.text;
        onChangeRef.current({ type: "record", content: accumulatedTextRef.current });
      }
    } catch (err: any) {
      console.error("STT Segment Error:", err);
      const errorNote = `[구간 변환 실패: ${err.message}]`;
      accumulatedTextRef.current = accumulatedTextRef.current
        ? `${accumulatedTextRef.current}\n${errorNote}`
        : errorNote;
      onChangeRef.current({ type: "record", content: accumulatedTextRef.current });
    } finally {
      setIsTranscribing(false);
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

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: actualType });
      chunksRef.current = [];

      // 아직 녹음 중이면 다음 세그먼트 바로 시작
      if (isRecordingRef.current) {
        setSegmentCount((prev) => prev + 1);
        startSegment(stream);
      }

      await processSegment(blob);
    };

    mediaRecorder.start();

    // SEGMENT_DURATION_MS 후 자동 교체
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
      accumulatedTextRef.current = "";
      isRecordingRef.current = true;
      setSegmentCount(1);
      onChangeRef.current({ type: "record", content: null });
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
      // 세그먼트 타이머 일시정지: 남은 시간 계산 후 타이머 해제
      if (segmentTimerRef.current) {
        clearTimeout(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }
      const elapsed = Date.now() - segmentStartTimeRef.current;
      segmentRemainingRef.current = Math.max(0, segmentRemainingRef.current - elapsed);
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      // 세그먼트 타이머 재개: 남은 시간으로 다시 설정
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
    const state = mediaRecorderRef.current?.state;
    if (state === "recording" || state === "paused") {
      if (state === "paused") mediaRecorderRef.current!.resume();
      mediaRecorderRef.current!.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRecording(false);
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
  } else if (value.content) {
    statusMsg = "녹음 및 변환 완료! 아래에서 내용을 확인하세요.";
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
            onChange={(e) => onChange({ type: "text", content: e.target.value })}
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
              <p style={{ marginTop: "1rem" }}>선택된 파일: {value.content.name}</p>
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

            {(isTranscribing || (typeof value.content === "string" && value.content)) && (
              <div style={{ marginTop: "1.5rem", width: "100%" }}>
                <label className={styles.label} style={{ marginBottom: "0.5rem", display: "block" }}>
                  변환된 내용 (확인 및 수정)
                </label>
                <textarea
                  className={styles.textarea}
                  placeholder={isTranscribing ? "텍스트 변환 중..." : "변환된 내용이 여기에 표시됩니다."}
                  value={typeof value.content === "string" ? value.content : ""}
                  onChange={(e) => onChange({ type: "record", content: e.target.value })}
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
