import React, { useState } from "react";
import {
  getApiKey, setApiKey,
  getOpenAiKey, setOpenAiKey,
  getClovaUrl, setClovaUrl,
  getClovaSecretKey, setClovaSecretKey,
  getSttProvider, setSttProvider,
  getClovaCredit, setClovaCredit,
  getGeminiPayAsYouGo, setGeminiPayAsYouGo,
  getGeminiAccumulatedTokens, resetAccumulatedBilling,
  type SttProvider,
} from "@/lib/apiKey";
import { isFolderPickerSupported } from "@/lib/folderStorage";
import type { NoteRecord } from "@/types/meeting";

interface ApiKeyModalProps {
  required?: boolean;
  onClose: () => void;
  folderName?: string | null;
  onPickFolder?: () => void;
  notes?: NoteRecord[];
}

export default function ApiKeyModal({ required = false, onClose, folderName, onPickFolder, notes }: ApiKeyModalProps) {
  const [provider, setProvider] = useState<SttProvider>(getSttProvider());
  const [geminiKey, setGeminiKey] = useState(getApiKey());
  const [openAiKey, setOpenAiKeyState] = useState(getOpenAiKey());
  const [clovaUrl, setClovaUrlState] = useState(getClovaUrl());
  const [clovaSecretKey, setClovaSecretKeyState] = useState(getClovaSecretKey());
  
  const [clovaCredit, setClovaCreditState] = useState(getClovaCredit());
  const [geminiPayAsYouGo, setGeminiPayAsYouGoState] = useState(getGeminiPayAsYouGo());
  const [geminiTokens, setGeminiTokens] = useState(getGeminiAccumulatedTokens());

  const [saved, setSaved] = useState(false);
  const [show, setShow] = useState(false);

  const activeKey = provider === "openai" ? openAiKey : geminiKey;
  const setActiveKey = provider === "openai" ? setOpenAiKeyState : setGeminiKey;

  function handleSave() {
    setSttProvider(provider);
    setApiKey(geminiKey);
    setOpenAiKey(openAiKey);
    setClovaUrl(clovaUrl);
    setClovaSecretKey(clovaSecretKey);
    setClovaCredit(clovaCredit);
    setGeminiPayAsYouGo(geminiPayAsYouGo);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  }

  const isSaveDisabled = saved || (
    provider === "clova" 
      ? (!clovaUrl.trim() || !clovaSecretKey.trim())
      : !activeKey.trim()
  );

  const masked = activeKey
    ? show
      ? activeKey
      : activeKey.slice(0, 6) + "•".repeat(Math.max(0, activeKey.length - 10)) + activeKey.slice(-4)
    : "";

  const maskedClovaKey = clovaSecretKey
    ? show
      ? clovaSecretKey
      : clovaSecretKey.slice(0, 6) + "•".repeat(Math.max(0, clovaSecretKey.length - 10)) + clovaSecretKey.slice(-4)
    : "";

  const providerMeta = {
    gemini: {
      label: "Gemini",
      placeholder: "AIzaSy...",
      guide: (
        <>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
            style={{ color: "var(--info)", fontWeight: 600, textDecoration: "none" }}>
            Google AI Studio
          </a>
          에서 무료로 발급받을 수 있습니다.
        </>
      ),
    },
    openai: {
      label: "OpenAI",
      placeholder: "sk-...",
      guide: (
        <>
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"
            style={{ color: "var(--info)", fontWeight: 600, textDecoration: "none" }}>
            OpenAI Platform
          </a>
          에서 발급받을 수 있습니다. gpt-4o-transcribe-diarize를 사용합니다.
        </>
      ),
    },
    clova: {
      label: "Clova Speech",
      placeholder: "https://clovaspeech-gw.ncloud.com/...",
      guide: (
        <>
          <a href="https://www.ncloud.com/product/aiService/clovaSpeech" target="_blank" rel="noreferrer"
            style={{ color: "var(--info)", fontWeight: 600, textDecoration: "none" }}>
            Naver Cloud Platform
          </a>
          에서 Clova Speech 빌드 후 발급받은 Invoke URL과 Secret Key를 입력하세요. 한국어 음성 인식 및 화자 분리 성능이 매우 뛰어납니다.
        </>
      ),
    },
  };

  const meta = providerMeta[provider];

  // 요금 계산 로직
  const totalAudioDurationSec = notes
    ? notes.reduce((acc, note) => acc + (note.audioDuration || 0), 0)
    : 0;
  const rawClovaCost = Math.round((totalAudioDurationSec / 60) * 4);
  const clovaRemainingCredit = Math.max(0, clovaCredit - rawClovaCost);
  const actualClovaBilling = Math.max(0, rawClovaCost - clovaCredit);

  const geminiInputCost = (geminiTokens.input / 1000000) * 0.075 * 1350;
  const geminiOutputCost = (geminiTokens.output / 1000000) * 0.30 * 1350;
  const rawGeminiCost = Math.round(geminiInputCost + geminiOutputCost);
  const actualGeminiBilling = geminiPayAsYouGo ? rawGeminiCost : 0;

  return (
    <div className="modal-bg" onClick={required ? undefined : onClose}>
      <div className="api-key-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #ede9fe, #fce7f3)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#7c3aed" strokeWidth="1.6">
              <circle cx="6" cy="7" r="4" />
              <path d="M10 11l4 4" strokeLinecap="round" />
              <path d="M6 5v4M4 7h4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>STT 및 요금 설정</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-4)" }}>음성 인식 엔진과 요금제 옵션을 관리합니다</div>
          </div>
          {!required && (
            <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" />
              </svg>
            </button>
          )}
        </div>

        {/* Provider Toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {(["gemini", "openai", "clova"] as SttProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              style={{
                flex: 1, padding: "7px 0", fontSize: 12.5, fontWeight: 600,
                borderRadius: "var(--r-md)", cursor: "pointer",
                border: provider === p ? "1.5px solid var(--accent)" : "1.5px solid var(--border-strong)",
                background: provider === p ? "var(--accent-soft, #ede9fe)" : "var(--surface)",
                color: provider === p ? "var(--accent, #7c3aed)" : "var(--ink-3)",
                transition: "all 0.15s",
              }}
            >
              {providerMeta[p].label}
            </button>
          ))}
        </div>

        {/* Key Input */}
        {provider === "clova" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>Invoke URL</div>
              <input
                type="text"
                value={clovaUrl}
                onChange={(e) => setClovaUrlState(e.target.value)}
                placeholder="https://clovaspeech-gw.ncloud.com/recog/v1/..."
                style={{
                  width: "100%", padding: "9px 12px", fontSize: 13,
                  border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
                  background: "var(--surface)", color: "var(--ink)", outline: "none",
                  fontFamily: "var(--font-mono)", boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>Secret Key</div>
              <div style={{ position: "relative" }}>
                <input
                  type={show ? "text" : "password"}
                  value={show ? clovaSecretKey : maskedClovaKey}
                  onChange={(e) => setClovaSecretKeyState(e.target.value)}
                  placeholder="Secret Key"
                  style={{
                    width: "100%", padding: "9px 40px 9px 12px", fontSize: 13,
                    border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
                    background: "var(--surface)", color: "var(--ink)", outline: "none",
                    fontFamily: "var(--font-mono)", boxSizing: "border-box",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && !isSaveDisabled && handleSave()}
                />
                <button
                  onClick={() => setShow((s) => !s)}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", padding: 2,
                  }}
                  title={show ? "숨기기" : "보기"}
                >
                  {show ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
                      <circle cx="8" cy="8" r="2" />
                      <line x1="2" y1="2" x2="14" y2="14" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
                      <circle cx="8" cy="8" r="2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              type={show ? "text" : "password"}
              value={show ? activeKey : masked}
              onChange={(e) => setActiveKey(e.target.value)}
              placeholder={meta.placeholder}
              style={{
                width: "100%", padding: "9px 40px 9px 12px", fontSize: 13,
                border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
                background: "var(--surface)", color: "var(--ink)", outline: "none",
                fontFamily: "var(--font-mono)", boxSizing: "border-box",
              }}
              onKeyDown={(e) => e.key === "Enter" && !isSaveDisabled && handleSave()}
              autoFocus
            />
            <button
              onClick={() => setShow((s) => !s)}
              style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", padding: 2,
              }}
              title={show ? "숨기기" : "보기"}
            >
              {show ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
                  <circle cx="8" cy="8" r="2" />
                  <line x1="2" y1="2" x2="14" y2="14" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
                  <circle cx="8" cy="8" r="2" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Guide */}
        <div style={{
          fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6,
          background: "var(--surface-2)", borderRadius: "var(--r-sm)",
          padding: "8px 10px", marginBottom: 16,
        }}>
          {meta.guide}
          {" "}키는 이 브라우저에만 저장되며 서버로 전송되지 않습니다.
        </div>

        {/* Folder picker */}
        {isFolderPickerSupported() && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8 }}>저장 폴더</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13 }}>📁</span>
              <span style={{ fontSize: 13, color: folderName ? "var(--ink)" : "var(--ink-4)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {folderName ?? "미지정"}
              </span>
              <button className="btn" onClick={onPickFolder} style={{ flexShrink: 0, fontSize: 12, padding: "5px 10px" }}>
                폴더 선택
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6 }}>
              노트 저장 시 지정 폴더에 마크다운 파일(.md)로 자동 저장됩니다.
            </div>
          </div>
        )}

        {/* 요금 통계 대시보드 */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8 }}>API 추정 요금 및 무료 한도</div>
          
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 4 }}>Clova 크레딧 (원)</div>
              <input
                type="number"
                value={clovaCredit || ""}
                onChange={(e) => setClovaCreditState(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="예: 100000"
                style={{
                  width: "100%", padding: "6px 10px", fontSize: 12,
                  border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
                  background: "var(--surface)", color: "var(--ink)", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 4 }}>Gemini 요금 플랜</div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", height: "100%", paddingLeft: 4 }}>
                <input
                  type="checkbox"
                  checked={geminiPayAsYouGo}
                  onChange={(e) => setGeminiPayAsYouGoState(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ userSelect: "none" }}>유료 과금 계정(Pay-as-you-go)</span>
              </label>
            </div>
          </div>

          <div style={{
            background: "var(--surface-2)", borderRadius: "var(--r-sm)",
            padding: "10px 12px", fontSize: 12, lineHeight: 1.6, color: "var(--ink-3)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>🎙️ Clova 누적 음성 분석 분량:</span>
              <strong>{Math.floor(totalAudioDurationSec / 60)}분 {totalAudioDurationSec % 60}초</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, paddingLeft: 10, fontSize: 11.5, color: "var(--ink-4)" }}>
              <span>└ 추정 원가 요금 (분당 4원):</span>
              <span>{rawClovaCost.toLocaleString()} 원</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, paddingLeft: 10, fontSize: 11.5, color: "var(--ink-4)" }}>
              <span>└ 남은 크레딧 잔액:</span>
              <span style={{ color: clovaRemainingCredit > 0 ? "#10b981" : "inherit" }}>
                {clovaRemainingCredit.toLocaleString()} 원
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, borderBottom: "1px dashed var(--border)", paddingBottom: 6 }}>
              <span>└ <strong>최종 청구 예상 요금</strong>:</span>
              <strong style={{ color: actualClovaBilling > 0 ? "#ef4444" : "inherit" }}>
                {actualClovaBilling.toLocaleString()} 원
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>🧠 Gemini 누적 사용 토큰:</span>
              <strong>{(geminiTokens.input + geminiTokens.output).toLocaleString()} 토큰</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, paddingLeft: 10, fontSize: 11.5, color: "var(--ink-4)" }}>
              <span>└ Input / Output:</span>
              <span>{geminiTokens.input.toLocaleString()} / {geminiTokens.output.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span>└ <strong>최종 청구 예상 요금</strong>:</span>
              <strong style={{ color: actualGeminiBilling > 0 ? "#ef4444" : "inherit" }}>
                {geminiPayAsYouGo ? `${actualGeminiBilling.toLocaleString()} 원` : "무료 티어 (0원)"}
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                onClick={() => {
                  if (confirm("누적 사용 요금 데이터를 초기화하시겠습니까?")) {
                    resetAccumulatedBilling();
                    setGeminiTokens({ input: 0, output: 0 });
                  }
                }}
                style={{
                  padding: "3px 8px", fontSize: 10.5, color: "var(--ink-4)",
                  border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
                  background: "var(--surface)", cursor: "pointer",
                }}
              >
                통계 초기화
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {!required && (
            <button className="btn" onClick={onClose}>취소</button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaveDisabled}
            style={{ minWidth: 80 }}
          >
            {saved ? "저장됨 ✓" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
