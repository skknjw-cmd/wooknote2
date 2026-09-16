"use client";

import React, { useState, useEffect, useRef } from "react";
import type { NoteRecord, DiscussionItem } from "@/types/meeting";

// context 텍스트("제목: 배경: ...\n논의: ...\n결론: ...") → DiscussionItem[]
function parseContextToDiscussions(context: string): DiscussionItem[] {
  if (!context.trim()) return [];
  const blocks = context.split(/\n\n+/);
  return blocks.map((block) => {
    // 첫 줄 또는 첫 `:` 이전이 제목, 나머지가 description
    const firstNewline = block.indexOf("\n");
    const firstColon = block.indexOf(": ");
    let title = "";
    let description = "";
    if (firstNewline !== -1 && (firstNewline < firstColon || firstColon === -1)) {
      title = block.slice(0, firstNewline).trim();
      description = block.slice(firstNewline + 1).trim();
    } else if (firstColon !== -1) {
      title = block.slice(0, firstColon).trim();
      description = block.slice(firstColon + 2).trim();
    } else {
      description = block.trim();
    }
    // 배경/논의/결론 파싱
    const item: DiscussionItem = { title };
    const parts: Record<string, string[]> = { background: [], discussion: [], conclusion: [] };
    let cur = "";
    for (const line of description.split("\n")) {
      if (/^배경[:：]/.test(line)) { cur = "background"; parts.background.push(line.replace(/^배경[:：]\s*/, "")); }
      else if (/^논의[:：]/.test(line)) { cur = "discussion"; parts.discussion.push(line.replace(/^논의[:：]\s*/, "")); }
      else if (/^결론[:：]/.test(line)) { cur = "conclusion"; parts.conclusion.push(line.replace(/^결론[:：]\s*/, "")); }
      else if (cur) parts[cur].push(line);
    }
    if (parts.background.length) item.background = parts.background.join(" ").trim();
    if (parts.discussion.length) item.discussion = parts.discussion.join(" ").trim();
    if (parts.conclusion.length) item.conclusion = parts.conclusion.join(" ").trim();
    if (!item.background && !item.discussion && !item.conclusion) item.background = description;
    return item;
  }).filter((item) => item.title || item.background || item.discussion || item.conclusion);
}

const EMPTY_NOTE: Partial<NoteRecord> = {
  title: "새로운 노트",
  summaryBullets: [],
  context: "",
  decisions: [],
  actions: [],
  questions: [],
  participants: [],
  nextAgenda: [],
  memo: "",
};

function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4a1 1 0 011-1h3.586a1 1 0 01.707.293L8 4h5a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 8 6.5 11.5 13 4" />
    </svg>
  );
}
function IconSquare() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    </svg>
  );
}
function IconQuestion() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M6.5 6a1.5 1.5 0 013 0c0 1-1.5 1.5-1.5 2.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <line x1="2" y1="7" x2="14" y2="7" />
      <line x1="5" y1="1.5" x2="5" y2="4.5" />
      <line x1="11" y1="1.5" x2="11" y2="4.5" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1l1.545 4.756H15l-4.045 2.939 1.545 4.756L8 10.512l-4.5 2.939 1.545-4.756L1 5.756h5.455z" />
    </svg>
  );
}

// ── 인라인 한 줄 입력 ──────────────────────────────────────────
function InlineInput({
  placeholder,
  onCommit,
  onCancel,
  initialValue = "",
}: {
  placeholder: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  initialValue?: string;
}) {
  const [val, setVal] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <input
      ref={ref}
      className="inline-input"
      value={val}
      placeholder={placeholder}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && val.trim()) { onCommit(val.trim()); }
        if (e.key === "Escape") { onCancel(); }
      }}
      onBlur={() => { if (val.trim()) onCommit(val.trim()); else onCancel(); }}
    />
  );
}

// ── 액션 추가 폼 ───────────────────────────────────────────────
function ActionDraftRow({
  onCommit,
  onCancel,
}: {
  onCommit: (a: { what: string; who: string; when: string; done: boolean }) => void;
  onCancel: () => void;
}) {
  const [what, setWhat] = useState("");
  const [who, setWho] = useState("");
  const [when, setWhen] = useState("");
  const whatRef = useRef<HTMLInputElement>(null);

  useEffect(() => { whatRef.current?.focus(); }, []);

  function commit() {
    if (!what.trim()) { onCancel(); return; }
    onCommit({ what: what.trim(), who: who.trim(), when: when.trim(), done: false });
  }

  return (
    <div className="act-row" style={{ flexDirection: "column", gap: 6, padding: "8px 8px" }}>
      <input
        ref={whatRef}
        className="inline-input"
        placeholder="할 일을 입력하세요"
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); }}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="inline-input"
          placeholder="@담당자"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); }}
          style={{ flex: 1 }}
        />
        <input
          className="inline-input"
          placeholder="기한 (예: 내일까지)"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); }}
          style={{ flex: 1 }}
          onBlur={commit}
        />
      </div>
    </div>
  );
}

export interface AnalysisViewProps {
  note: NoteRecord | null;
  pendingTurnCount?: number;
  analyzing?: boolean;
  onRegen?: () => void;
  onUpdateNote?: (note: NoteRecord) => void;
  onClose: () => void;
}

/**
 * AI 분석 결과를 전체 화면으로 띄운다.
 *
 * 기본 화면에 두지 않는 이유: 회의가 끝나도 분석은 자동으로 돌지 않는다. 늘 띄워 두면
 * "요약이 없습니다"가 화면 대부분을 차지한다. 여기 블록들은 이제 삭제된 NoteDocument에서
 * 그대로 옮겨 온 것이라 편집 동작(contentEditable · 할 일 추가 · 체크박스)이 예전과 같다.
 */
export default function AnalysisView({
  note,
  pendingTurnCount = 0,
  analyzing = false,
  onRegen,
  onUpdateNote,
  onClose,
}: AnalysisViewProps) {
  // Esc로 닫는다. 전체 화면을 덮으므로 빠져나갈 길이 분명해야 한다.
  //
  // 단 입력 중일 때는 양보한다. 이 화면 안의 InlineInput·ActionDraftRow·contentEditable
  // 글머리는 Esc를 "이 편집 취소"로 쓰는데, React의 합성 핸들러는 버블링 중에 돌고 이
  // window 리스너는 그보다 뒤에 돈다. 그래서 그냥 두면 결정사항 초안을 Esc로 무르는 순간
  // 화면 전체가 같이 닫히고, contentEditable에서는 언마운트라 onBlur도 안 불려 고치던
  // 내용이 그대로 날아간다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [regenerating, setRegenerating] = useState(false);
  const data = { ...EMPTY_NOTE, ...note };

  // ── 로컬 편집 상태 ─────────────────────────────────────────
  const [summaryBullets, setSummaryBullets] = useState<string[]>(data.summaryBullets ?? []);
  const [discussions, setDiscussions] = useState<DiscussionItem[]>(
    note?.discussions?.length ? note.discussions : parseContextToDiscussions(data.context || "")
  );
  const [decisions, setDecisions] = useState<string[]>(data.decisions ?? []);
  const [actions, setActions] = useState(data.actions ?? []);
  const [questions, setQuestions] = useState<string[]>(data.questions ?? []);
  const [nextAgenda, setNextAgenda] = useState<string[]>(data.nextAgenda ?? []);

  // note prop 변경 시 동기화 — id 변경(노트 전환) 또는 분석 결과 도착 시
  useEffect(() => {
    setSummaryBullets(note?.summaryBullets ?? []);
    setDiscussions(note?.discussions?.length ? note.discussions : parseContextToDiscussions(note?.context || ""));
    setDecisions(note?.decisions ?? []);
    setActions(note?.actions ?? []);
    setQuestions(note?.questions ?? []);
    setNextAgenda(note?.nextAgenda ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, note?.summaryBullets, note?.discussions, note?.context, note?.decisions, note?.actions, note?.questions, note?.nextAgenda]);

  // ── 드래프트 열림 상태 ─────────────────────────────────────
  const [addingDecision, setAddingDecision] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [addingAgenda, setAddingAgenda] = useState(false);

  // ── 인라인 편집 상태 ───────────────────────────────────────
  const [editingDecision, setEditingDecision] = useState<number | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null);
  const [editingAgenda, setEditingAgenda] = useState<number | null>(null);

  function updateDiscussion(i: number, field: keyof DiscussionItem, value: string) {
    setDiscussions((prev) => {
      const next = prev.map((item, j) => j === i ? { ...item, [field]: value } : item);
      if (note) onUpdateNote?.({ ...note, discussions: next });
      return next;
    });
  }

  function push<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, field: keyof NoteRecord, item: T) {
    setter((prev) => {
      const next = [...prev, item];
      if (note) onUpdateNote?.({ ...note, [field]: next });
      return next;
    });
  }

  function update<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, field: keyof NoteRecord, index: number, value: T) {
    setter((prev) => {
      const next = prev.map((v, i) => (i === index ? value : v));
      if (note) onUpdateNote?.({ ...note, [field]: next });
      return next;
    });
  }

  const hasPending = pendingTurnCount > 0;
  const pendingActions = actions.filter((a) => !a.done).length;

  async function handleRegen() {
    setRegenerating(true);
    onRegen?.();
    await new Promise((r) => setTimeout(r, 1500));
    setRegenerating(false);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="AI 분석 결과">
      <div className="overlay-h">
        <b>분석 결과</b>
        <div className="spacer" />
        <button className="btn" onClick={onClose}>닫기</button>
      </div>
      <div className="overlay-body">
        {/* Block 1: AI 정리 */}
        <div className="nblock">
          <div className="ai-block">
            <div className="nblock-h">
              <span className="ico" style={{ color: "#7c3aed" }}><IconStar /></span>
              <span className="badge-ai">AI 정리</span>
              핵심 요약
              {hasPending && (
                <span style={{
                  fontSize: 11, padding: "1px 8px",
                  background: "#fff7ed", color: "#c2410c",
                  border: "1px solid #fed7aa",
                  borderRadius: 999, marginLeft: 4, fontWeight: 600,
                }}>
                  새 발화 {pendingTurnCount}개
                </span>
              )}
              <div className="meta">
                {/* regenerating 타이머(1.5초)는 실제 분석 시간과 무관하다. analyzing까지
                    함께 보지 않으면 버튼만 먼저 "다시 정리"로 돌아와, 바로 아래 본문이
                    "AI 분석 중..."인 동안 다시 눌러 /api/analyze를 한 번 더 부를 수 있다. */}
                <button className="gen-btn" onClick={handleRegen} disabled={regenerating || analyzing}>
                  {regenerating ? "생성 중..." : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M2 8a6 6 0 1 0 1.5-4" strokeLinecap="round" />
                        <polyline points="1 4 2 8 6 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      다시 정리
                    </>
                  )}
                </button>
              </div>
            </div>
            {analyzing ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M2 8a6 6 0 1 0 1.5-4" />
                  <polyline points="1 4 2 8 6 7" strokeLinejoin="round" />
                </svg>
                AI 분석 중...
              </p>
            ) : summaryBullets.length > 0 ? (
              <ul>
                {summaryBullets.map((b, i) => (
                  <li
                    key={i}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const v = e.currentTarget.textContent?.trim() || "";
                      const next = summaryBullets.map((x, j) => j === i ? v : x).filter(Boolean);
                      setSummaryBullets(next);
                      if (note) onUpdateNote?.({ ...note, summaryBullets: next });
                    }}
                    style={{ outline: "none", cursor: "text" }}
                  >{b}</li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--ink-4)", fontSize: 13 }}>
                {/* 이 오버레이 안에는 [다시 정리] 버튼이 늘 있다(위 .meta). 화면 밖의
                    버튼을 가리키던 mode 분기는 그래서 필요 없어졌다. */}
                아직 정리하지 않았습니다. 위 [다시 정리]를 누르면 AI가 요약합니다.
              </p>
            )}
          </div>
        </div>

        {/* Block 2: 주요 논의 내용 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><IconFolder /></span>
            주요 논의 내용
          </div>
          {discussions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {discussions.map((item: DiscussionItem, i: number) => (
                <div key={i} style={{
                  borderLeft: "3px solid var(--border-strong)",
                  paddingLeft: 12,
                  paddingBottom: 4,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  {item.title !== undefined && (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => updateDiscussion(i, "title", e.currentTarget.textContent?.trim() || "")}
                      style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", outline: "none", cursor: "text" }}
                    >{item.title}</div>
                  )}
                  {item.background !== undefined && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)", display: "flex", gap: 6 }}>
                      <span style={{ color: "var(--ink-4)", flexShrink: 0, fontWeight: 500 }}>배경</span>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updateDiscussion(i, "background", e.currentTarget.textContent?.trim() || "")}
                        style={{ outline: "none", cursor: "text", flex: 1 }}
                      >{item.background}</span>
                    </div>
                  )}
                  {item.discussion !== undefined && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)", display: "flex", gap: 6 }}>
                      <span style={{ color: "var(--ink-4)", flexShrink: 0, fontWeight: 500 }}>논의</span>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updateDiscussion(i, "discussion", e.currentTarget.textContent?.trim() || "")}
                        style={{ outline: "none", cursor: "text", flex: 1 }}
                      >{item.discussion}</span>
                    </div>
                  )}
                  {item.conclusion !== undefined && (
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)", display: "flex", gap: 6 }}>
                      <span style={{ color: "var(--ink-4)", flexShrink: 0, fontWeight: 500 }}>결론</span>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => updateDiscussion(i, "conclusion", e.currentTarget.textContent?.trim() || "")}
                        style={{ outline: "none", cursor: "text", flex: 1 }}
                      >{item.conclusion}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => {
                if (note) onUpdateNote?.({ ...note, context: e.currentTarget.textContent ?? "" });
              }}
              style={{ outline: "none", minHeight: 24, whiteSpace: "pre-wrap" }}
            >
              {data.context || ""}
            </p>
          )}
        </div>

        {/* Block 3: 결정사항 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><IconCheck /></span>
            결정사항
            <button className="add-btn" onClick={() => setAddingDecision(true)}>+ 추가</button>
          </div>
          {decisions.length > 0 && (
            <ul className="d-list">
              {decisions.map((d, i) =>
                editingDecision === i ? (
                  <li key={i} style={{ listStyle: "none", paddingLeft: 0 }}>
                    <InlineInput
                      placeholder="결정사항 입력"
                      initialValue={d}
                      onCommit={(v) => { update(setDecisions, "decisions", i, v); setEditingDecision(null); }}
                      onCancel={() => setEditingDecision(null)}
                    />
                  </li>
                ) : (
                  <li key={i} onClick={() => setEditingDecision(i)} style={{ cursor: "text" }}>{d}</li>
                )
              )}
            </ul>
          )}
          {addingDecision && (
            <div style={{ paddingLeft: 22 }}>
              <InlineInput
                placeholder="결정사항을 입력하세요"
                onCommit={(v) => { push(setDecisions, "decisions", v); setAddingDecision(false); }}
                onCancel={() => setAddingDecision(false)}
              />
            </div>
          )}
          {decisions.length === 0 && !addingDecision && (
            <p style={{ color: "var(--ink-4)", fontSize: 13 }}>결정사항이 없습니다.</p>
          )}
        </div>

        {/* Block 4: 해야 할 일 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><IconSquare /></span>
            해야 할 일
            {pendingActions > 0 && (
              <span style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 500 }}>
                {pendingActions}건 진행 중
              </span>
            )}
            <button className="add-btn" onClick={() => setAddingAction(true)}>+ 추가</button>
          </div>
          {actions.length > 0 && (
            <div className="act-list">
              {actions.map((a, i) => (
                <div key={i} className={`act-row${a.done ? " done" : ""}`}>
                  <input
                    type="checkbox"
                    checked={a.done}
                    style={{ accentColor: a.done ? "var(--info)" : "var(--ink)" }}
                    onChange={() => update(setActions, "actions", i, { ...a, done: !a.done })}
                  />
                  <div className="body">
                    <div
                      className="text"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const v = e.currentTarget.textContent?.trim();
                        if (v) update(setActions, "actions", i, { ...a, what: v });
                      }}
                      style={{ outline: "none", cursor: "text" }}
                    >
                      {a.what}
                    </div>
                    <div className="row2">
                      <span
                        className="who"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          const v = (e.currentTarget.textContent?.trim() || "").replace(/^@/, "");
                          update(setActions, "actions", i, { ...a, who: v });
                        }}
                        style={{ outline: "none", cursor: "text", minWidth: 20 }}
                        data-placeholder="@담당자"
                      >{a.who ? `@${a.who}` : ""}</span>
                      <span
                        className="when"
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          const v = e.currentTarget.textContent?.trim() || "";
                          update(setActions, "actions", i, { ...a, when: v });
                        }}
                        style={{ outline: "none", cursor: "text", minWidth: 20 }}
                        data-placeholder="기한"
                      >{a.when || ""}</span>
                    </div>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const v = (e.currentTarget.textContent?.trim() || "").replace(/^완료기준:\s*/, "");
                        update(setActions, "actions", i, { ...a, notes: v || undefined } as typeof a);
                      }}
                      style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, outline: "none", cursor: "text", minHeight: 16 }}
                      data-placeholder="완료기준"
                    >{a.notes ? `완료기준: ${a.notes}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {addingAction && (
            <ActionDraftRow
              onCommit={(a) => { push(setActions, "actions", a); setAddingAction(false); }}
              onCancel={() => setAddingAction(false)}
            />
          )}
          {actions.length === 0 && !addingAction && (
            <p style={{ color: "var(--ink-4)", fontSize: 13 }}>할 일이 없습니다.</p>
          )}
        </div>

        {/* Block 5: 미결정사항 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><IconQuestion /></span>
            미결정사항
            <button className="add-btn" onClick={() => setAddingQuestion(true)}>+ 추가</button>
          </div>
          {questions.length > 0 && (
            <ul className="q-list">
              {questions.map((q, i) =>
                editingQuestion === i ? (
                  <li key={i} style={{ listStyle: "none", paddingLeft: 0 }}>
                    <InlineInput
                      placeholder="미결정사항 입력"
                      initialValue={q}
                      onCommit={(v) => { update(setQuestions, "questions", i, v); setEditingQuestion(null); }}
                      onCancel={() => setEditingQuestion(null)}
                    />
                  </li>
                ) : (
                  <li key={i} onClick={() => setEditingQuestion(i)} style={{ cursor: "text" }}>{q}</li>
                )
              )}
            </ul>
          )}
          {addingQuestion && (
            <div style={{ paddingLeft: 22 }}>
              <InlineInput
                placeholder="미결정사항을 입력하세요"
                onCommit={(v) => { push(setQuestions, "questions", v); setAddingQuestion(false); }}
                onCancel={() => setAddingQuestion(false)}
              />
            </div>
          )}
          {questions.length === 0 && !addingQuestion && (
            <p style={{ color: "var(--ink-4)", fontSize: 13 }}>미결정사항이 없습니다.</p>
          )}
        </div>

        {/* Block 6: 향후 일정 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><IconCalendar /></span>
            향후 일정
            <button className="add-btn" onClick={() => setAddingAgenda(true)}>+ 추가</button>
          </div>
          {nextAgenda.length > 0 && (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {nextAgenda.map((a, i) =>
                editingAgenda === i ? (
                  <li key={i}>
                    <InlineInput
                      placeholder="일정 입력"
                      initialValue={a}
                      onCommit={(v) => { update(setNextAgenda, "nextAgenda", i, v); setEditingAgenda(null); }}
                      onCancel={() => setEditingAgenda(null)}
                    />
                  </li>
                ) : (
                  <li
                    key={i}
                    onClick={() => setEditingAgenda(i)}
                    style={{ fontSize: 13.5, color: "var(--ink-2)", paddingLeft: 14, position: "relative", cursor: "text" }}
                  >
                    <span style={{ position: "absolute", left: 0, color: "var(--ink-4)" }}>·</span>
                    {a}
                  </li>
                )
              )}
            </ul>
          )}
          {addingAgenda && (
            <div style={{ paddingLeft: 14 }}>
              <InlineInput
                placeholder="일정을 입력하세요"
                onCommit={(v) => { push(setNextAgenda, "nextAgenda", v); setAddingAgenda(false); }}
                onCancel={() => setAddingAgenda(false)}
              />
            </div>
          )}
          {nextAgenda.length === 0 && !addingAgenda && (
            <p style={{ color: "var(--ink-4)", fontSize: 13 }}>향후 일정이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
