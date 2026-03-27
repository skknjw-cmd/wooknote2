import React, { useRef, useState, useEffect } from "react";
import styles from "./InputTabs.module.css";

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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleTabClick = (type: "text" | "file" | "record") => {
    if (isRecording) {
      stopRecording();
    }
    onChange({ type, content: type === "text" ? "" : null });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setIsTranscribing(true);
        
        try {
          // Immediate STT call for feedback
          const formData = new FormData();
          formData.append("media", blob);
          
          const res = await fetch("/api/stt", {
            method: "POST",
            body: formData,
          });
          
          if (!res.ok) throw new Error("STT failed");
          const data = await res.json();
          
          // Store the text instead of Blob for confirmation
          onChange({ type: "record", content: data.text });
        } catch (err) {
          console.error("STT Feedback Error:", err);
          alert("음성을 텍스트로 변환하는 데 실패했습니다. 다시 시도해 주세요.");
          onChange({ type: "record", content: null });
        } finally {
          setIsTranscribing(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err);
      alert("마이크 접근 권한이 없거나 지원되지 않는 브라우저입니다.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

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
              <p style={{ color: "var(--text-secondary)" }}>
                {isRecording ? "녹음 중입니다... (Clova Speech 연결 대기)" : 
                 isTranscribing ? "텍스트로 변환 중입니다... 잠시만 기다려주세요." :
                 (value.content ? "녹음 및 변환 완료! 아래에서 내용을 확인하세요." : "버튼을 눌러 회의 녹음을 시작하세요")}
              </p>
              <button
                className={`${styles.recordBtn} ${isRecording ? styles.recording : ""}`}
                onClick={toggleRecording}
                disabled={isTranscribing}
              >
                {isRecording ? "⏹" : isTranscribing ? "..." : "⏺"}
              </button>
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
