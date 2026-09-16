"use client";

import React, { useState } from "react";
import { extractDatabaseId } from "@/lib/apiKey";
import type {
  NotionFieldKey,
  NotionFieldMapping,
  NotionMappingConfig,
  NotionSchemaResponse,
} from "@/types/meeting";

type PropertyInfo = { name: string; type: string; options?: string[] };

interface Props {
  token: string;
  databaseId: string;
  mapping: NotionMappingConfig | null;
  onTokenChange: (v: string) => void;
  onDatabaseIdChange: (v: string) => void;
  onMappingChange: (m: NotionMappingConfig | null) => void;
}

/** 앱 필드와 그 필드가 받아들이는 Notion 속성 타입. */
const FIELDS: Array<{ key: NotionFieldKey; label: string; types: string[] }> = [
  { key: "meetingDate", label: "회의일시", types: ["date"] },
  { key: "attendees", label: "참석자", types: ["rich_text"] },
  { key: "durationText", label: "소요시간", types: ["rich_text"] },
  { key: "status", label: "상태", types: ["select", "status"] },
  { key: "entryMethod", label: "입력방식", types: ["select", "status"] },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", fontSize: 13,
  border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
  background: "var(--surface)", color: "var(--ink)", outline: "none",
  fontFamily: "var(--font-mono)", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  flex: 1, padding: "6px 8px", fontSize: 12,
  border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
  background: "var(--surface)", color: "var(--ink)", boxSizing: "border-box",
};

export default function NotionConnectionPanel({
  token, databaseId, mapping,
  onTokenChange, onDatabaseIdChange, onMappingChange,
}: Props) {
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { dataSourceId: string; dataSourceName: string; properties: PropertyInfo[] } | null
  >(null);
  const [staleNotice, setStaleNotice] = useState(false);

  const canTest = token.trim().length > 0 && databaseId.trim().length > 0 && !testing;

  async function handleTest() {
    setTesting(true);
    setError(null);
    setStaleNotice(false);
    try {
      const res = await fetch("/api/notion/schema", {
        method: "POST",
        headers: {
          "x-notion-token": token.trim(),
          "x-notion-db": extractDatabaseId(databaseId),
        },
      });
      const data = (await res.json().catch(() => null)) as NotionSchemaResponse | null;
      if (!data || typeof data.ok !== "boolean") {
        setError(`Notion 서버 응답을 해석하지 못했습니다. (HTTP ${res.status})`);
        setResult(null);
        return;
      }
      if (!data.ok) {
        setError(data.error);
        setResult(null);
        return;
      }
      setResult({
        dataSourceId: data.dataSourceId,
        dataSourceName: data.dataSourceName,
        properties: data.properties,
      });
      // 저장된 매핑이 다른 DB의 것이면 복원하지 않고 알린다.
      if (mapping && mapping.dataSourceId !== data.dataSourceId) {
        setStaleNotice(true);
        onMappingChange(null);
      }
    } catch {
      setError("서버에 연결할 수 없습니다.");
      setResult(null);
    } finally {
      setTesting(false);
    }
  }

  /** 드롭다운 한 칸을 바꾼다. result가 있어야만 호출된다. */
  function updateField(key: NotionFieldKey, next: NotionFieldMapping | undefined) {
    if (!result) return;
    const fields = { ...(mapping?.fields ?? {}) };
    if (next === undefined) delete fields[key];
    else fields[key] = next;
    onMappingChange({
      dataSourceId: result.dataSourceId,
      dataSourceName: result.dataSourceName,
      fields,
    });
  }

  const current = (key: NotionFieldKey): NotionFieldMapping | undefined => mapping?.fields?.[key];

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8 }}>
        Notion 연동
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>
            Internal Integration Token
          </div>
          <input
            type={show ? "text" : "password"}
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="ntn_..."
            style={inputStyle}
          />
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>
            데이터베이스 ID 또는 URL
          </div>
          <input
            type="text"
            value={databaseId}
            onChange={(e) => onDatabaseIdChange(e.target.value)}
            placeholder="https://notion.so/... 또는 32자 ID"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={handleTest}
          disabled={!canTest}
          style={{ fontSize: 12, padding: "5px 10px" }}
        >
          {testing ? "확인 중…" : "연결 테스트"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setShow((s) => !s)}
          style={{ fontSize: 12, padding: "5px 10px" }}
        >
          {show ? "토큰 숨기기" : "토큰 보기"}
        </button>
      </div>

      {error && (
        <div style={{
          fontSize: 11.5, color: "#ef4444", lineHeight: 1.6,
          background: "var(--surface-2)", borderRadius: "var(--r-sm)",
          padding: "8px 10px", marginTop: 10,
        }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
            ✓ <strong>{result.dataSourceName || "(제목 없음)"}</strong> · 속성 {result.properties.length}개
          </div>

          {staleNotice && (
            <div style={{
              fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6,
              background: "var(--surface-2)", borderRadius: "var(--r-sm)",
              padding: "8px 10px", marginBottom: 8,
            }}>
              다른 데이터베이스의 매핑이라 초기화했습니다. 다시 설정해 주세요.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {FIELDS.map((f) => {
              const m = current(f.key);
              // 다른 필드가 이미 선택한 속성은 후보에서 제외한다 (단, 이 필드 자신의
              // 현재 선택은 남겨 둬야 드롭다운에 표시할 수 있다).
              const takenByOthers = new Set(
                FIELDS.filter((o) => o.key !== f.key)
                  .map((o) => current(o.key)?.property)
                  .filter((p): p is string => !!p),
              );
              const candidates = result.properties.filter(
                (p) => f.types.includes(p.type) && (!takenByOthers.has(p.name) || p.name === m?.property),
              );
              const chosen = result.properties.find((p) => p.name === m?.property);
              const value = m === undefined ? "__auto__" : m.property === null ? "__none__" : m.property;
              return (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)", width: 64, flexShrink: 0 }}>
                    {f.label}
                  </span>
                  <select
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__auto__") updateField(f.key, undefined);
                      else if (v === "__none__") updateField(f.key, { property: null });
                      else updateField(f.key, { property: v, option: null });
                    }}
                    style={selectStyle}
                  >
                    <option value="__auto__">(자동)</option>
                    <option value="__none__">(사용 안 함)</option>
                    {candidates.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  {chosen?.options && (
                    <select
                      value={m?.option ?? ""}
                      onChange={(e) =>
                        updateField(f.key, { property: chosen.name, option: e.target.value || null })
                      }
                      style={selectStyle}
                    >
                      <option value="">(옵션 선택)</option>
                      {chosen.options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{
        fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6,
        background: "var(--surface-2)", borderRadius: "var(--r-sm)",
        padding: "8px 10px", marginTop: 10,
      }}>
        회의가 끝나면 AI 분석 없이 이 데이터베이스에 바로 저장됩니다.
        Notion에서 <strong>해당 DB 우측 상단 ⋯ → 연결</strong>로 통합(Integration)을 초대해야 합니다.
        <strong>연결 테스트</strong>를 누르면 속성 목록을 읽어와 어느 속성에 넣을지 고를 수 있습니다.
        매핑을 설정하지 않으면 <code>회의일시</code> · <code>참석자</code> · <code>소요시간</code> ·{" "}
        <code>상태</code> · <code>입력방식</code> 이름으로 찾고, 없는 속성은 건너뜁니다.
        <code>상태</code>는 선택(Select)과 상태(Status) 타입을 모두 지원하며, Status는 API로 새 옵션을
        만들 수 없어 <strong>기존 옵션과 이름이 일치할 때만</strong> 채워집니다.
      </div>
    </div>
  );
}
