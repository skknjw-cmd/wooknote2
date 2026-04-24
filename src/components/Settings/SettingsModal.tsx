import React, { useState, useEffect } from "react";
import styles from "./SettingsModal.module.css";
import { clearMeetingResult } from "@/lib/meetingStorage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export type UserSettings = {
  geminiKey: string;
  clovaInvokeUrl: string;
  clovaSecretKey: string;
};

export const DEFAULT_SETTINGS: UserSettings = {
  geminiKey: "",
  clovaInvokeUrl: "",
  clovaSecretKey: "",
};

export default function SettingsModal({ isOpen, onClose }: Props) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem("wooks_settings");
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem("wooks_settings", JSON.stringify(settings));
    alert("설정이 저장되었습니다.");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2>⚙️ 환경 설정</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </header>

        <div className={styles.content}>
          <p className={styles.info}>
            입력하신 정보는 브라우저(LocalStorage)에만 안전하게 저장됩니다. 
            개발자용 .env 파일이 구성되지 않은 경우, 모든 항목을 반드시 입력해야 정상 작동합니다.
          </p>

          <div className={styles.group}>
            <label>Google Gemini API Key</label>
            <input 
              type="password" 
              value={settings.geminiKey}
              onChange={(e) => setSettings({...settings, geminiKey: e.target.value})}
              placeholder="AI 분석용 API 키"
            />
          </div>

          <div className={styles.group}>
            <label>Clova Speech Invoke URL</label>
            <input 
              type="text" 
              value={settings.clovaInvokeUrl}
              onChange={(e) => setSettings({...settings, clovaInvokeUrl: e.target.value})}
              placeholder="https://clovaspeech-gw.ncloud.com/external/v1/..."
            />
          </div>

          <div className={styles.group}>
            <label>Clova Speech Secret Key</label>
            <input 
              type="password" 
              value={settings.clovaSecretKey}
              onChange={(e) => setSettings({...settings, clovaSecretKey: e.target.value})}
              placeholder="음성 변환용 Secret Key"
            />
          </div>

        </div>

        <footer className={styles.footer}>
          <button
            className={styles.saveBtn}
            style={{ background: "#ef4444", marginRight: "0.5rem" }}
            onClick={() => {
              const ok = window.confirm(
                "저장된 회의록과 화자 이름 지정 내역이 삭제됩니다. 되돌릴 수 없습니다. 진행할까요?"
              );
              if (!ok) return;
              clearMeetingResult();
              alert("저장된 회의록을 삭제했습니다.");
            }}
          >
            저장된 회의록 삭제
          </button>
          <button className={styles.saveBtn} onClick={handleSave}>
            저장하기
          </button>
        </footer>
      </div>
    </div>
  );
}
