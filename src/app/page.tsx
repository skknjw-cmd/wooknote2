"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import InputTabs from "@/components/InputSection/InputTabs";
import MeetingInfoForm from "@/components/ConfigSection/MeetingInfoForm";
import AnalysisOptions from "@/components/ConfigSection/AnalysisOptions";
import SettingsModal from "@/components/Settings/SettingsModal";
import SpeakerMappingPanel from "@/components/InputSection/SpeakerMappingPanel";
import { resolveSegments } from "@/lib/speakerMapping";
import { saveMeetingResult } from "@/lib/meetingStorage";
import type { InputData, SpeakerMapping } from "@/types/meeting";

const DEFAULT_ANALYSIS_OPTIONS: readonly string[] = [
  "핵심요약",
  "참석자 분석",
  "아젠다별 요약",
  "주요 결정 사항",
  "To-Do List",
  "리스크/이슈",
  "진행계획",
  "배경 및 목적",
  "미결정사항",
];

const makeInitialMeetingInfo = () => ({
  title: "",
  date: new Date().toISOString().split("T")[0],
  location: "",
  attendees: "",
});

export default function Home() {
  const router = useRouter();

  const [showSettings, setShowSettings] = useState(false);

  const [meetingInfo, setMeetingInfo] = useState(makeInitialMeetingInfo);

  const [selectedOptions, setSelectedOptions] = useState<string[]>([
    ...DEFAULT_ANALYSIS_OPTIONS,
  ]);

  const [inputData, setInputData] = useState<InputData>({
    type: "text",
    content: "",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [addedAttendeeChips, setAddedAttendeeChips] = useState<string[]>([]);
  const [recorderStatus, setRecorderStatus] = useState({
    isRecording: false,
    isTranscribing: false,
  });

  useEffect(() => {
    const saved = localStorage.getItem("wooks_temp_input");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.meetingInfo) setMeetingInfo(parsed.meetingInfo);
        if (parsed.selectedOptions) setSelectedOptions(parsed.selectedOptions);
        if (parsed.inputData) setInputData(parsed.inputData);
      } catch (e) {
        console.error("Temp data load error:", e);
      }
    }
  }, []);

  const handleMappingChange = (next: SpeakerMapping) => {
    setInputData((prev) => ({ ...prev, mapping: next }));
  };

  const handleReset = () => {
    if (!window.confirm("모든 내용이 초기화됩니다. 계속할까요?")) return;
    setMeetingInfo(makeInitialMeetingInfo());
    setSelectedOptions([...DEFAULT_ANALYSIS_OPTIONS]);
    setInputData({ type: "text", content: "" });
    setAddedAttendeeChips([]);
    try {
      localStorage.removeItem("wooks_temp_input");
    } catch (e) {
      console.error("Reset: failed to clear temp storage", e);
    }
  };

  const handleGlobalUndo = () => {
    setInputData((prev) => {
      const segs = prev.segments ?? [];
      if (segs.length === 0) return prev;
      const nextSegs = segs.map((s) =>
        s.rawClovaKey && s.rawClovaKey !== s.originalSpeaker
          ? { ...s, originalSpeaker: s.rawClovaKey }
          : s
      );
      return { ...prev, segments: nextSegs };
    });
  };

  const handleAttendeeAdd = (name: string) => {
    if (!name) return;
    const existing = meetingInfo.attendees
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (existing.includes(name)) return;
    const nextCsv = existing.length ? `${existing.join(", ")}, ${name}` : name;
    setMeetingInfo({ ...meetingInfo, attendees: nextCsv });
    setAddedAttendeeChips((prev) => [...prev, name]);
  };

  const removeAttendeeChip = (name: string) => {
    const existing = meetingInfo.attendees
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((n) => n !== name);
    setMeetingInfo({ ...meetingInfo, attendees: existing.join(", ") });
    setAddedAttendeeChips((prev) => prev.filter((n) => n !== name));
  };

  const handleSubmit = async () => {
    if (inputData.type === "text" && !(inputData.content as string)?.trim()) {
      alert("회의 내용을 입력해주세요.");
      return;
    }
    if (inputData.type === "file" && !inputData.content) {
      alert("파일을 업로드해주세요.");
      return;
    }
    if (inputData.type === "record" && !inputData.content) {
      alert("녹음을 완료해주세요.");
      return;
    }

    localStorage.setItem(
      "wooks_temp_input",
      JSON.stringify({ meetingInfo, selectedOptions, inputData })
    );

    setIsGenerating(true);
    try {
      const savedSettings = localStorage.getItem("wooks_settings");
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      const customHeaders: Record<string, string> = {};
      if (settings.geminiKey) customHeaders["x-gemini-key"] = settings.geminiKey;
      if (settings.clovaInvokeUrl)
        customHeaders["x-clova-url"] = settings.clovaInvokeUrl;
      if (settings.clovaSecretKey)
        customHeaders["x-clova-key"] = settings.clovaSecretKey;
      const attendeeCount = meetingInfo.attendees
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean).length;
      if (attendeeCount > 0)
        customHeaders["x-attendee-count"] = String(attendeeCount);

      let finalContent = "";

      if (
        inputData.type === "record" &&
        inputData.segments &&
        inputData.segments.length > 0
      ) {
        finalContent = resolveSegments(
          inputData.segments,
          inputData.mapping ?? {}
        );
      } else if (
        inputData.type === "record" &&
        typeof inputData.content === "string"
      ) {
        finalContent = inputData.content;
      } else if (
        inputData.type === "file" &&
        inputData.content instanceof File &&
        !inputData.content.name.endsWith(".txt")
      ) {
        const formData = new FormData();
        formData.append("media", inputData.content);
        const sttRes = await fetch("/api/stt", {
          method: "POST",
          headers: customHeaders,
          body: formData,
        });
        if (!sttRes.ok) {
          const errorData = await sttRes.json().catch(() => ({}));
          throw new Error(errorData.error || "STT 변환에 실패했습니다.");
        }
        const sttData = await sttRes.json();
        finalContent = sttData.text ?? "";
      } else if (inputData.type === "file" && inputData.content instanceof File) {
        finalContent = await inputData.content.text();
      } else {
        finalContent = (inputData.content as string) || "";
      }

      if (!finalContent.trim()) throw new Error("분석할 내용이 없습니다.");

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...customHeaders,
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

      saveMeetingResult({
        analysis: analysisResult,
        segments: inputData.segments ?? [],
        mapping: inputData.mapping ?? {},
        meetingInfo,
        selectedOptions,
      });

      router.push("/result");
    } catch (error: unknown) {
      console.error("Submit Error:", error);
      const msg = error instanceof Error ? error.message : "알 수 없는 오류";
      alert(`오류: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const hasSegments =
    inputData.type === "record" && (inputData.segments?.length ?? 0) > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <div style={{ textAlign: "left" }}>
            <h1 className={styles.title}>WOOK&apos;S 회의록</h1>
            <p className={styles.subtitle}>회의록 자동요약 및 작성</p>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <button
              className={styles.resetBtn}
              onClick={handleReset}
              disabled={
                isGenerating ||
                recorderStatus.isRecording ||
                recorderStatus.isTranscribing
              }
              title="회의 정보, 분석 옵션, 입력 내용을 모두 초기화합니다 (저장된 회의록과 API 설정은 유지)"
            >
              새로 시작
            </button>
            <button
              className={styles.settingsBtn}
              onClick={() => setShowSettings(true)}
              title="사용자 API 설정"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className={styles.mainLayout}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>회의 정보 및 옵션</h2>
          <MeetingInfoForm value={meetingInfo} onChange={setMeetingInfo} />
          {addedAttendeeChips.length > 0 && (
            <div
              style={{
                marginTop: "0.5rem",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.4rem",
              }}
            >
              {addedAttendeeChips.map((name) => (
                <span
                  key={name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    background: "#ecfdf5",
                    color: "#065f46",
                    padding: "0.3rem 0.65rem",
                    borderRadius: "999px",
                    fontSize: "0.8rem",
                  }}
                >
                  + {name} (새로 추가됨)
                  <button
                    onClick={() => removeAttendeeChip(name)}
                    aria-label={`${name} 제거`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#065f46",
                      cursor: "pointer",
                      fontSize: "1rem",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--bg-tertiary)",
              margin: "1.5rem 0",
            }}
          />
          <AnalysisOptions
            selected={selectedOptions}
            onChange={setSelectedOptions}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>회의 내용 입력</h2>
          <InputTabs
            value={inputData}
            attendeesCsv={meetingInfo.attendees}
            onChange={setInputData}
            onStatusChange={setRecorderStatus}
          />
          {hasSegments && (
            <SpeakerMappingPanel
              segments={inputData.segments ?? []}
              mapping={inputData.mapping ?? {}}
              attendeesCsv={meetingInfo.attendees}
              isRecording={recorderStatus.isRecording}
              isTranscribing={recorderStatus.isTranscribing}
              onChange={handleMappingChange}
              onAttendeeAdd={handleAttendeeAdd}
              onGlobalUndo={handleGlobalUndo}
            />
          )}
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
