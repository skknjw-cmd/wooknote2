"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import InputTabs from "@/components/InputSection/InputTabs";
import MeetingInfoForm from "@/components/ConfigSection/MeetingInfoForm";
import AnalysisOptions from "@/components/ConfigSection/AnalysisOptions";
import SettingsModal from "@/components/Settings/SettingsModal";

export default function Home() {
  const router = useRouter();
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);

  // Form States
  const [meetingInfo, setMeetingInfo] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    location: "",
    attendees: "",
  });

  const [selectedOptions, setSelectedOptions] = useState<string[]>([
    "핵심요약",
    "참석자 분석",
    "아젠다별 요약",
    "주요 결정 사항",
    "To-Do List",
    "리스크/이슈",
    "진행계획",
    "배경 및 목적",
    "미결정사항",
  ]);

  const [inputData, setInputData] = useState<{
    type: "text" | "file" | "record";
    content: string | File | Blob | null;
  }>({ type: "text", content: "" });

  const [isGenerating, setIsGenerating] = useState(false);

  // Load temp data for "Redo"
  useEffect(() => {
    const saved = localStorage.getItem("wooks_temp_input");
    if (saved) {
      try {
        const { meetingInfo: mi, selectedOptions: so, inputData: id } = JSON.parse(saved);
        if (mi) setMeetingInfo(mi);
        if (so) setSelectedOptions(so);
        if (id) setInputData(id);
      } catch (e) {
        console.error("Temp data load error:", e);
      }
    }
  }, []);

  const handleSubmit = async () => {
    if (inputData.type !== "text" && !inputData.content) {
      alert("회의 내용을 입력하거나 파일을 업로드/녹음해주세요.");
      return;
    }
    
    // Save current state for Redo
    localStorage.setItem("wooks_temp_input", JSON.stringify({ meetingInfo, selectedOptions, inputData }));

    setIsGenerating(true);
    if (inputData.type !== "text" && !inputData.content) {
      alert("회의 내용을 입력하거나 파일을 업로드/녹음해주세요.");
      return;
    }
    if (inputData.type === "text" && !(inputData.content as string).trim()) {
      alert("회의 내용을 입력해주세요.");
      return;
    }

    setIsGenerating(true);
    try {
      // Load user settings
      const savedSettings = localStorage.getItem("wooks_settings");
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      
      const customHeaders: Record<string, string> = {};
      if (settings.geminiKey) customHeaders["x-gemini-key"] = settings.geminiKey;
      if (settings.clovaInvokeUrl) customHeaders["x-clova-url"] = settings.clovaInvokeUrl;
      if (settings.clovaSecretKey) customHeaders["x-clova-key"] = settings.clovaSecretKey;

      let finalContent = "";

      // 1. STT Phase
      if (inputData.type === "record" && typeof inputData.content === "string") {
        finalContent = inputData.content;
      } else if (inputData.type === "record" || (inputData.type === "file" && inputData.content instanceof File && !inputData.content.name.endsWith(".txt"))) {
        const formData = new FormData();
        formData.append("media", inputData.content as Blob);
        
        const sttRes = await fetch("/api/stt", {
          method: "POST",
          headers: customHeaders, // Pass user keys if any
          body: formData,
        });
        
        if (!sttRes.ok) {
          const errorData = await sttRes.json().catch(() => ({}));
          throw new Error(errorData.error || "STT 변환에 실패했습니다.");
        }
        const sttData = await sttRes.ok ? await sttRes.json() : { text: "" };
        finalContent = sttData.text;
      } else if (inputData.type === "file" && inputData.content instanceof File) {
        finalContent = await inputData.content.text();
      } else {
        finalContent = (inputData.content as string) || "";
      }

      if (!finalContent.trim()) throw new Error("분석할 내용이 없습니다.");

      // 2. Analysis Phase
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...customHeaders 
        },
        body: JSON.stringify({
          meetingInfo,
          selectedOptions,
          content: finalContent,
        }),
      });

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json().catch(() => ({}));
        throw new Error(errorData.error || "회의록 분석에 실패했습니다.");
      }
      const analysisResult = await analyzeRes.json();

      localStorage.setItem("last_meeting_result", JSON.stringify(analysisResult));
      router.push("/result");
    } catch (error: any) {
      console.error("Submit Error:", error);
      alert(`오류: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
          <div style={{ textAlign: "left" }}>
            <h1 className={styles.title}>WOOK&apos;S 회의록</h1>
            <p className={styles.subtitle}>회의록 자동요약 및 작성</p>
          </div>
          <button 
            className={styles.settingsBtn} 
            onClick={() => setShowSettings(true)}
            title="사용자 API 설정"
          >
            ⚙️
          </button>
        </div>
      </header>

      <main className={styles.mainLayout}>
        {/* Left Column: Config */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>회의 정보 및 옵션</h2>
          <MeetingInfoForm value={meetingInfo} onChange={setMeetingInfo} />
          <hr style={{ border: "none", borderTop: "1px solid var(--bg-tertiary)", margin: "1.5rem 0" }} />
          <AnalysisOptions selected={selectedOptions} onChange={setSelectedOptions} />
        </section>

        {/* Right Column: Input & Generate */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>회의 내용 입력</h2>
          <InputTabs value={inputData} onChange={setInputData} />
          <button 
            className={styles.submitBtn} 
            onClick={handleSubmit}
            disabled={isGenerating}
          >
            {isGenerating ? "분석 및 생성 중..." : "회의록 작성하기"}
          </button>
        </section>
      </main>

      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />
    </div>
  );
}
