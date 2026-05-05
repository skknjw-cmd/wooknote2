# AutoNote V2 — Phase 1: UI Shell & Design System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** V2 Granola 디자인 시스템과 3단 레이아웃 셸을 구현한다. 실제 데이터/STT 없이도 앱 전체 골격이 렌더링되어야 한다.

**Architecture:** `globals.css` 디자인 토큰 교체 → `AppShell` 3단 CSS Grid → 각 패널(NoteList / LiveTranscript / NoteDocument)을 정적 컴포넌트로 구현 후 `page.tsx`에 마운트. 기존 기능(STT, 분석)은 Phase 2–3에서 연결.

**Tech Stack:** Next.js 16, React 19, CSS Modules, Pretendard 폰트

---

## 파일 맵

| 작업 | 파일 |
|------|------|
| 신규 | `src/app/globals.css` (전체 교체) |
| 신규 | `src/components/Layout/AppShell.tsx` |
| 신규 | `src/components/Layout/AppShell.module.css` |
| 신규 | `src/components/Layout/ModelLoadingOverlay.tsx` |
| 신규 | `src/components/Layout/ModelLoadingOverlay.module.css` |
| 신규 | `src/components/Sidebar/NoteList.tsx` |
| 신규 | `src/components/Sidebar/NoteList.module.css` |
| 신규 | `src/components/Transcript/LiveTranscript.tsx` |
| 신규 | `src/components/Transcript/LiveTranscript.module.css` |
| 신규 | `src/components/Transcript/SpeakerBubble.tsx` |
| 신규 | `src/components/Transcript/SpeakerBubble.module.css` |
| 신규 | `src/components/Transcript/KeywordChips.tsx` |
| 신규 | `src/components/Transcript/KeywordChips.module.css` |
| 신규 | `src/components/Transcript/RecordingBar.tsx` |
| 신규 | `src/components/Transcript/RecordingBar.module.css` |
| 신규 | `src/components/NoteDoc/NoteDocument.tsx` |
| 신규 | `src/components/NoteDoc/NoteDocument.module.css` |
| 수정 | `src/app/page.tsx` (AppShell 마운트) |
| 수정 | `src/app/layout.tsx` (Pretendard 폰트 추가) |
| 수정 | `next.config.ts` (webpack alias) |
| 수정 | `package.json` (@huggingface/transformers 추가) |

---

## Task 1: 의존성 설치 + next.config.ts 수정

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`

- [ ] **Step 1: @huggingface/transformers 설치**

```bash
cd c:/Users/다우닝/project/autonote
npm install @huggingface/transformers
```

Expected: `package.json`에 `"@huggingface/transformers"` 추가됨.

- [ ] **Step 2: next.config.ts에 webpack alias 추가**

`next.config.ts`를 아래로 교체:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "sharp$": false,
      "onnxruntime-node$": false,
    };
    return config;
  },
};

export default nextConfig;
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build 2>&1 | tail -20
```

Expected: `onnxruntime-node` 관련 에러 없이 빌드 완료.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts package.json package-lock.json
git commit -m "feat: add @huggingface/transformers + webpack alias for ONNX"
```

---

## Task 2: V2 디자인 토큰 (globals.css 교체)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: layout.tsx에 Pretendard 폰트 추가**

`src/app/layout.tsx` 상단 `<head>` 또는 metadata 아래에 Pretendard 링크 추가. 현재 파일을 읽은 뒤 `<html>` 태그 안 `<head>`가 없으면 `metadata.other` 또는 `<link>` 직접 삽입. Next.js 16에서 `<head>` 내 `<link>`를 직접 두려면 `export const metadata` 방식 대신 아래처럼:

```typescript
// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoNote",
  description: "AI 회의록",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: globals.css 전체 교체**

```css
/* src/app/globals.css — V2 Granola Design System */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Surfaces */
  --bg:            #fafaf9;
  --surface:       #ffffff;
  --surface-2:     #f6f6f4;
  --surface-3:     #efeeec;
  --hover:         rgba(0,0,0,0.04);
  --active:        rgba(0,0,0,0.06);

  /* Text / Ink */
  --ink:           #18181b;
  --ink-2:         #3f3f46;
  --ink-3:         #71717a;
  --ink-4:         #a1a1aa;
  --ink-5:         #d4d4d8;

  /* Borders */
  --border:        #ececea;
  --border-strong: #d8d7d4;
  --divider:       #f0f0ee;

  /* Recording */
  --rec:           #dc2626;
  --rec-soft:      #fef2f2;

  /* Info */
  --info:          #2563eb;

  /* Speaker palette */
  --sp1:           #4f46e5;  --sp1-soft: #eef2ff;
  --sp2:           #0d9488;  --sp2-soft: #f0fdfa;
  --sp3:           #b45309;  --sp3-soft: #fffbeb;
  --sp4:           #be185d;  --sp4-soft: #fdf2f8;

  /* Shadows */
  --shadow-1:      0 1px 2px rgba(0,0,0,0.04);
  --shadow-2:      0 4px 16px rgba(0,0,0,0.06);
  --shadow-3:      0 12px 40px rgba(0,0,0,0.10);

  /* Radius */
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 12px;
  --r-xl: 16px;

  /* Typography */
  --font-sans: "Pretendard Variable", "Pretendard", ui-sans-serif,
    -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
    "Noto Sans KR", system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
}

html, body {
  height: 100%;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

button { cursor: pointer; font-family: inherit; }
a { color: inherit; text-decoration: none; }
input, textarea { font-family: inherit; }

@keyframes pulse-rec {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.55; transform: scale(0.85); }
}
@keyframes blink-cursor {
  50% { opacity: 0; }
}
@keyframes fade-up {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: dev 서버에서 배경색 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 열어 배경색이 `#fafaf9` 웜 오프화이트로 변경됐는지 확인.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(design): V2 Granola design tokens + Pretendard font"
```

---

## Task 3: AppShell — 3단 CSS Grid

**Files:**
- Create: `src/components/Layout/AppShell.tsx`
- Create: `src/components/Layout/AppShell.module.css`

- [ ] **Step 1: AppShell.module.css 작성**

```css
/* src/components/Layout/AppShell.module.css */
.shell {
  display: grid;
  grid-template-rows: 44px 1fr 52px;
  grid-template-columns: 240px 380px 1fr;
  grid-template-areas:
    "topbar topbar topbar"
    "sidebar transcript notedoc"
    "sidebar recbar   notedoc";
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

/* ─── Topbar ─── */
.topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px 0 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-size: 12.5px;
}
.topbarBrand {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: -0.3px;
  flex-shrink: 0;
}
.topbarBreadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: 12px;
}
.topbarBreadcrumb span { color: var(--ink); font-weight: 500; }
.topbarSep { color: var(--ink-5); }
.topbarSpacer { flex: 1; }
.livePill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  background: var(--rec-soft);
  border: 1px solid #fecaca;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  color: var(--rec);
}
.liveDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rec);
  animation: pulse-rec 1.4s ease-in-out infinite;
}
.iconBtn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  transition: background 0.12s, color 0.12s;
}
.iconBtn:hover { background: var(--hover); color: var(--ink); }

/* ─── Sidebar ─── */
.sidebar {
  grid-area: sidebar;
  background: var(--surface-2);
  border-right: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ─── Transcript panel ─── */
.transcript {
  grid-area: transcript;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ─── Recording bar ─── */
.recbar {
  grid-area: recbar;
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-right: 1px solid var(--border);
}

/* ─── Note document ─── */
.notedoc {
  grid-area: notedoc;
  background: var(--surface);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: AppShell.tsx 작성 (정적 플레이스홀더)**

```tsx
// src/components/Layout/AppShell.tsx
"use client";

import styles from "./AppShell.module.css";

interface AppShellProps {
  sidebar: React.ReactNode;
  transcript: React.ReactNode;
  recbar: React.ReactNode;
  notedoc: React.ReactNode;
  noteTitle: string;
  isRecording?: boolean;
  elapsed?: string;
}

export default function AppShell({
  sidebar,
  transcript,
  recbar,
  notedoc,
  noteTitle,
  isRecording = false,
  elapsed = "00:00:00",
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      {/* Topbar */}
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}>AutoNote</div>
        <div className={styles.topbarBreadcrumb}>
          <span className={styles.topbarSep}>/</span>
          <span>{noteTitle || "새 녹음"}</span>
        </div>
        <div className={styles.topbarSpacer} />
        {isRecording && (
          <div className={styles.livePill}>
            <span className={styles.liveDot} />
            LIVE {elapsed}
          </div>
        )}
        <button className={styles.iconBtn} title="내보내기" aria-label="내보내기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button className={styles.iconBtn} title="AI 분석" aria-label="AI 분석">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      </header>

      {/* Sidebar */}
      <aside className={styles.sidebar}>{sidebar}</aside>

      {/* Transcript */}
      <section className={styles.transcript}>{transcript}</section>

      {/* Recording bar */}
      <div className={styles.recbar}>{recbar}</div>

      {/* Note document */}
      <main className={styles.notedoc}>{notedoc}</main>
    </div>
  );
}
```

- [ ] **Step 3: 브라우저 확인**

`src/app/page.tsx`에서 AppShell 임시 마운트:

```tsx
// page.tsx 최상단에 임시로 추가 (실제 교체는 Task 11)
import AppShell from "@/components/Layout/AppShell";
// return 이전에:
return (
  <AppShell
    noteTitle="생산 라인 점검"
    isRecording={true}
    elapsed="00:35:07"
    sidebar={<div style={{padding:16, color:"var(--ink-3)"}}>사이드바</div>}
    transcript={<div style={{padding:16, color:"var(--ink-3)"}}>트랜스크립트</div>}
    recbar={<div style={{padding:16, color:"var(--ink-3)"}}>녹음바</div>}
    notedoc={<div style={{padding:36, color:"var(--ink-3)"}}>노트 문서</div>}
  />
);
```

3단 그리드가 화면에 올바르게 렌더링되는지 확인. 각 영역의 배경색과 경계선 확인.

- [ ] **Step 4: Commit**

```bash
git add src/components/Layout/
git commit -m "feat(layout): AppShell 3-column CSS Grid shell"
```

---

## Task 4: NoteList 사이드바

**Files:**
- Create: `src/components/Sidebar/NoteList.tsx`
- Create: `src/components/Sidebar/NoteList.module.css`

- [ ] **Step 1: NoteList.module.css 작성**

```css
/* src/components/Sidebar/NoteList.module.css */
.root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 새 녹음 버튼 영역 */
.header {
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.newBtn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  background: var(--ink);
  color: #fff;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 600;
  transition: filter 0.12s;
}
.newBtn:hover { filter: brightness(1.15); }
.newBtnShortcut {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.55;
  font-family: var(--font-mono);
}

/* 검색 */
.search {
  padding: 8px 10px;
  border-bottom: 1px solid var(--divider);
  flex-shrink: 0;
}
.searchInput {
  width: 100%;
  padding: 6px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  font-size: 12px;
  color: var(--ink);
  outline: none;
  transition: border-color 0.12s;
}
.searchInput::placeholder { color: var(--ink-4); }
.searchInput:focus { border-color: var(--border-strong); }

/* 목록 */
.list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px;
}
.sectionLabel {
  padding: 10px 8px 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* 노트 아이템 */
.item {
  padding: 8px 10px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 0.1s;
}
.item:hover { background: var(--hover); }
.item.active { background: var(--active); }
.itemTitle {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.itemMeta {
  display: flex;
  gap: 6px;
  font-size: 11px;
  color: var(--ink-4);
  margin-top: 2px;
  font-family: var(--font-mono);
}

/* 진행 중 (녹음 중) */
.item.recording .itemTitle {
  display: flex;
  align-items: center;
  gap: 6px;
}
.recDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rec);
  flex-shrink: 0;
  animation: pulse-rec 1.4s ease-in-out infinite;
}
.recTimer {
  font-size: 11px;
  color: var(--rec);
  font-family: var(--font-mono);
  font-weight: 500;
}
```

- [ ] **Step 2: NoteList.tsx 작성**

```tsx
// src/components/Sidebar/NoteList.tsx
"use client";

import styles from "./NoteList.module.css";

export interface NoteItem {
  id: string;
  title: string;
  time: string;        // "오전 10:15"
  duration: string;    // "22:14"
  isRecording?: boolean;
  elapsed?: string;    // "00:35:07" (녹음 중일 때)
}

interface NoteListProps {
  items: NoteItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNewRecording: () => void;
}

const GROUP_LABELS: Record<string, string> = {
  recording: "진행 중",
  today: "오늘",
  yesterday: "어제",
  older: "이전",
};

export default function NoteList({
  items,
  activeId,
  onSelect,
  onNewRecording,
}: NoteListProps) {
  const recording = items.filter((i) => i.isRecording);
  const today = items.filter((i) => !i.isRecording && i.time.includes("오전") || i.time.includes("오후"));
  // 실제 날짜 기반 그룹화는 Phase 3 (IndexedDB) 연동 시 구현
  // 지금은 모든 비-녹음 아이템을 "오늘"로 표시

  const sections: { key: string; items: NoteItem[] }[] = [
    { key: "recording", items: recording },
    { key: "today", items: today },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button className={styles.newBtn} onClick={onNewRecording}>
          <span>+ 새 녹음</span>
          <span className={styles.newBtnShortcut}>⌘N</span>
        </button>
      </div>

      <div className={styles.search}>
        <input
          className={styles.searchInput}
          placeholder="노트 · 화자 · 키워드"
          type="text"
        />
      </div>

      <div className={styles.list}>
        {sections.map(({ key, items: sItems }) => {
          if (sItems.length === 0) return null;
          return (
            <div key={key}>
              <div className={styles.sectionLabel}>
                {GROUP_LABELS[key]} {sItems.length}
              </div>
              {sItems.map((note) => (
                <div
                  key={note.id}
                  className={`${styles.item} ${activeId === note.id ? styles.active : ""} ${note.isRecording ? styles.recording : ""}`}
                  onClick={() => onSelect(note.id)}
                >
                  <div className={styles.itemTitle}>
                    {note.isRecording && <span className={styles.recDot} />}
                    {note.title}
                  </div>
                  <div className={styles.itemMeta}>
                    {note.isRecording ? (
                      <span className={styles.recTimer}>
                        녹음 중 · {note.elapsed}
                      </span>
                    ) : (
                      <>
                        <span>{note.time}</span>
                        <span>·</span>
                        <span>{note.duration}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: AppShell에 NoteList 연결 (임시 데이터)**

`src/app/page.tsx`의 `sidebar` prop에 아래 교체:

```tsx
import NoteList from "@/components/Sidebar/NoteList";

// AppShell의 sidebar prop:
sidebar={
  <NoteList
    activeId="note-1"
    items={[
      { id: "note-1", title: "생산 라인 점검", time: "오후 3:39", duration: "35:07", isRecording: true, elapsed: "00:35:07" },
      { id: "note-2", title: "Q2 예산 검토", time: "오전 10:15", duration: "22:14" },
      { id: "note-3", title: "신입 온보딩 1on1", time: "오전 9:00", duration: "12:48" },
    ]}
    onSelect={(id) => console.log("selected", id)}
    onNewRecording={() => console.log("new recording")}
  />
}
```

브라우저에서 사이드바 렌더링 확인. 녹음 중 항목의 빨간 점 애니메이션 확인.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar/
git commit -m "feat(sidebar): NoteList component with recording state"
```

---

## Task 5: SpeakerBubble 컴포넌트

**Files:**
- Create: `src/components/Transcript/SpeakerBubble.tsx`
- Create: `src/components/Transcript/SpeakerBubble.module.css`

- [ ] **Step 1: SpeakerBubble.module.css 작성**

```css
/* src/components/Transcript/SpeakerBubble.module.css */
.turn {
  padding: 10px 0;
  border-top: 1px solid var(--divider);
  animation: fade-up 0.25s ease;
}
.turn:first-child { border-top: none; }

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* 화자별 색상: CSS custom property로 주입 */
.name {
  font-size: 12.5px;
  font-weight: 700;
}
.time {
  font-size: 11px;
  color: var(--ink-4);
  font-family: var(--font-mono);
  margin-left: auto;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 4px;
  transition: background 0.1s;
}
.time:hover { background: var(--hover); color: var(--ink-3); }

.text {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink-2);
  letter-spacing: -0.005em;
  padding-left: 16px;
}

/* 타이핑 커서 */
.typing::after {
  content: "▍";
  animation: blink-cursor 0.9s step-end infinite;
  color: var(--rec);
  font-size: 12px;
}
```

- [ ] **Step 2: SpeakerBubble.tsx 작성**

```tsx
// src/components/Transcript/SpeakerBubble.tsx
import styles from "./SpeakerBubble.module.css";

const SPEAKER_COLORS: Record<number, { dot: string; name: string }> = {
  1: { dot: "#4f46e5", name: "#4f46e5" },  // Indigo
  2: { dot: "#0d9488", name: "#0d9488" },  // Teal
  3: { dot: "#b45309", name: "#b45309" },  // Amber
  4: { dot: "#be185d", name: "#be185d" },  // Pink
};

function speakerIndex(speakerLabel: string): number {
  const n = parseInt(speakerLabel.replace(/\D/g, ""), 10);
  return isNaN(n) ? 1 : ((n - 1) % 4) + 1;
}

interface SpeakerBubbleProps {
  speakerLabel: string;     // "화자 1" or real name "김태현"
  text: string;
  timestampMs: number;      // 녹음 시작 기준 ms
  isLive?: boolean;         // 현재 타이핑 중
  onTimeClick?: (ms: number) => void;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function SpeakerBubble({
  speakerLabel,
  text,
  timestampMs,
  isLive = false,
  onTimeClick,
}: SpeakerBubbleProps) {
  const idx = speakerIndex(speakerLabel);
  const colors = SPEAKER_COLORS[idx] ?? SPEAKER_COLORS[1];

  return (
    <div className={styles.turn}>
      <div className={styles.header}>
        <span className={styles.dot} style={{ background: colors.dot }} />
        <span className={styles.name} style={{ color: colors.name }}>
          {speakerLabel}
        </span>
        <button
          className={styles.time}
          onClick={() => onTimeClick?.(timestampMs)}
        >
          {formatMs(timestampMs)}
        </button>
      </div>
      <p className={`${styles.text} ${isLive ? styles.typing : ""}`}>
        {text}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Transcript/SpeakerBubble.tsx src/components/Transcript/SpeakerBubble.module.css
git commit -m "feat(transcript): SpeakerBubble component with speaker color system"
```

---

## Task 6: KeywordChips 컴포넌트

**Files:**
- Create: `src/components/Transcript/KeywordChips.tsx`
- Create: `src/components/Transcript/KeywordChips.module.css`

- [ ] **Step 1: KeywordChips.module.css 작성**

```css
/* src/components/Transcript/KeywordChips.module.css */
.strip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  scrollbar-width: none;
}
.strip::-webkit-scrollbar { display: none; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
  flex-shrink: 0;
}
.chip:hover { background: var(--surface-2); border-color: var(--border-strong); }
.chip.selected {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}
.count {
  font-size: 10px;
  opacity: 0.6;
}
```

- [ ] **Step 2: KeywordChips.tsx 작성**

```tsx
// src/components/Transcript/KeywordChips.tsx
"use client";

import { useState } from "react";
import styles from "./KeywordChips.module.css";

export interface Keyword {
  word: string;
  count: number;
}

interface KeywordChipsProps {
  keywords: Keyword[];
  onSelect?: (word: string | null) => void;
}

export default function KeywordChips({ keywords, onSelect }: KeywordChipsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = (word: string) => {
    const next = selected === word ? null : word;
    setSelected(next);
    onSelect?.(next);
  };

  if (keywords.length === 0) return null;

  return (
    <div className={styles.strip}>
      {keywords.map((kw) => (
        <button
          key={kw.word}
          className={`${styles.chip} ${selected === kw.word ? styles.selected : ""}`}
          onClick={() => handleClick(kw.word)}
        >
          {kw.word}
          <span className={styles.count}>{kw.count}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Transcript/KeywordChips.tsx src/components/Transcript/KeywordChips.module.css
git commit -m "feat(transcript): KeywordChips with frequency count + selection"
```

---

## Task 7: LiveTranscript 패널

**Files:**
- Create: `src/components/Transcript/LiveTranscript.tsx`
- Create: `src/components/Transcript/LiveTranscript.module.css`

- [ ] **Step 1: LiveTranscript.module.css 작성**

```css
/* src/components/Transcript/LiveTranscript.module.css */
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.headerIcon {
  color: var(--ink-3);
}
.headerTitle {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}
.headerLive {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px 14px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: var(--ink-4);
  font-size: 13px;
  text-align: center;
}
.emptyIcon { font-size: 32px; opacity: 0.4; }
```

- [ ] **Step 2: LiveTranscript.tsx 작성**

```tsx
// src/components/Transcript/LiveTranscript.tsx
"use client";

import { useEffect, useRef } from "react";
import styles from "./LiveTranscript.module.css";
import SpeakerBubble from "./SpeakerBubble";
import KeywordChips, { type Keyword } from "./KeywordChips";

export interface TranscriptTurn {
  id: string;
  speakerLabel: string;
  text: string;
  startMs: number;
  isLive?: boolean;
}

interface LiveTranscriptProps {
  turns: TranscriptTurn[];
  keywords: Keyword[];
  elapsed: string;         // "35:07"
  isRecording: boolean;
  onTimeClick?: (ms: number) => void;
  onKeywordSelect?: (word: string | null) => void;
}

export default function LiveTranscript({
  turns,
  keywords,
  elapsed,
  isRecording,
  onTimeClick,
  onKeywordSelect,
}: LiveTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 발화 추가 시 자동 스크롤
  useEffect(() => {
    if (isRecording) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [turns.length, isRecording]);

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerIcon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 18v-6a9 9 0 0118 0v6"/>
            <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>
          </svg>
        </span>
        <span className={styles.headerTitle}>트랜스크립트</span>
        <span className={styles.headerLive}>
          {isRecording ? `LIVE ${elapsed}` : elapsed}
        </span>
      </div>

      {/* Keywords */}
      <KeywordChips keywords={keywords} onSelect={onKeywordSelect} />

      {/* Turns */}
      <div className={styles.body}>
        {turns.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🎙</span>
            <span>녹음을 시작하면 실시간으로 표시됩니다</span>
          </div>
        ) : (
          turns.map((turn) => (
            <SpeakerBubble
              key={turn.id}
              speakerLabel={turn.speakerLabel}
              text={turn.text}
              timestampMs={turn.startMs}
              isLive={turn.isLive}
              onTimeClick={onTimeClick}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: page.tsx transcript prop 교체 (더미 데이터)**

```tsx
import LiveTranscript from "@/components/Transcript/LiveTranscript";

// AppShell의 transcript prop:
transcript={
  <LiveTranscript
    isRecording={true}
    elapsed="35:07"
    keywords={[
      { word: "3월 13일", count: 4 },
      { word: "전수 검사", count: 3 },
      { word: "용접 불량", count: 3 },
      { word: "중국 공장", count: 2 },
      { word: "납기일", count: 2 },
    ]}
    turns={[
      { id: "1", speakerLabel: "김태현", text: "아이고 괜히 뭐 그것 때문에 온 건 아니고요. 그건 그냥 짧게 걔는 어떻게 보고드렸냐면, 궁금한 게 있어요.", startMs: 5000 },
      { id: "2", speakerLabel: "이영석", text: "정확한 수치가 안 나와. 지금 저희도 중국 공장하고 통화를 하고 있는데 애네들이 기계가 이렇게 5대가 돌고 있는데...", startMs: 27000 },
      { id: "3", speakerLabel: "김태현", text: "근데 기존에는 없었는데 이번에 있었던 건 이번 것만 그렇다라고 추정을 해야 되니.", startMs: 48000 },
      { id: "4", speakerLabel: "이영석", text: "예상으로는 2~3일 정도 소요될 것 같고요.", startMs: 118000, isLive: true },
    ]}
  />
}
```

브라우저 확인: 화자 이름이 색상별로 표시되고, 타이핑 커서 애니메이션 동작.

- [ ] **Step 4: Commit**

```bash
git add src/components/Transcript/
git commit -m "feat(transcript): LiveTranscript panel with speaker bubbles + keywords"
```

---

## Task 8: RecordingBar 컴포넌트

**Files:**
- Create: `src/components/Transcript/RecordingBar.tsx`
- Create: `src/components/Transcript/RecordingBar.module.css`

- [ ] **Step 1: RecordingBar.module.css 작성**

```css
/* src/components/Transcript/RecordingBar.module.css */
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  height: 52px;
}

/* 녹음 버튼 */
.recBtn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s;
}
.recBtn:hover { transform: scale(1.08); }
.recBtn.recording {
  background: var(--rec);
  color: #fff;
}
.recBtn.idle {
  background: var(--ink);
  color: #fff;
}
/* 녹음 중 → 정사각형 stop 아이콘 */
.stopIcon {
  width: 11px;
  height: 11px;
  background: #fff;
  border-radius: 2px;
}
/* 대기 중 → 원형 record 아이콘 */
.startIcon {
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
}

/* 타이머 */
.timer {
  font-size: 13px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--ink);
  flex-shrink: 0;
}
.timerTotal {
  font-size: 11px;
  color: var(--ink-4);
  margin-left: 4px;
}

/* 웨이브폼 / 진행바 */
.progress {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.progressBar {
  position: relative;
  height: 4px;
  background: var(--surface-3);
  border-radius: 2px;
  cursor: pointer;
}
.progressFill {
  height: 100%;
  border-radius: 2px;
  background: var(--ink);
  pointer-events: none;
}
.progressThumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ink);
  box-shadow: 0 0 0 2px var(--surface);
  pointer-events: none;
}

/* 속도 + 스킵 */
.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.ctrlBtn {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  font-size: 12px;
  color: var(--ink-2);
  background: none;
  transition: background 0.1s;
}
.ctrlBtn:hover { background: var(--hover); }
.speedBtn {
  font-weight: 600;
  font-family: var(--font-mono);
  min-width: 34px;
  text-align: center;
}
```

- [ ] **Step 2: RecordingBar.tsx 작성**

```tsx
// src/components/Transcript/RecordingBar.tsx
"use client";

import { useState } from "react";
import styles from "./RecordingBar.module.css";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface RecordingBarProps {
  isRecording: boolean;
  elapsedMs: number;
  totalMs?: number;
  onToggle: () => void;
  onSeek?: (ms: number) => void;
}

function msToHMS(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  return `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}

export default function RecordingBar({
  isRecording,
  elapsedMs,
  totalMs,
  onToggle,
  onSeek,
}: RecordingBarProps) {
  const [speedIdx, setSpeedIdx] = useState(2); // 기본 1x
  const progress = totalMs ? (elapsedMs / totalMs) * 100 : 0;

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!totalMs || !onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.floor(ratio * totalMs));
  };

  const cycleSpeed = () => setSpeedIdx((i) => (i + 1) % SPEEDS.length);

  return (
    <div className={styles.bar}>
      {/* 녹음 토글 */}
      <button
        className={`${styles.recBtn} ${isRecording ? styles.recording : styles.idle}`}
        onClick={onToggle}
        aria-label={isRecording ? "녹음 중지" : "녹음 시작"}
      >
        {isRecording ? (
          <span className={styles.stopIcon} />
        ) : (
          <span className={styles.startIcon} />
        )}
      </button>

      {/* 타이머 */}
      <span className={styles.timer}>
        {msToHMS(elapsedMs)}
        {totalMs && (
          <span className={styles.timerTotal}> / {msToHMS(totalMs)}</span>
        )}
      </span>

      {/* 진행 바 */}
      <div className={styles.progress}>
        <div className={styles.progressBar} onClick={handleBarClick}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          {totalMs && (
            <div className={styles.progressThumb} style={{ left: `${progress}%` }} />
          )}
        </div>
      </div>

      {/* 컨트롤 */}
      <div className={styles.controls}>
        <button className={styles.ctrlBtn}>-15s</button>
        <button className={`${styles.ctrlBtn} ${styles.speedBtn}`} onClick={cycleSpeed}>
          {SPEEDS[speedIdx]}x
        </button>
        <button className={styles.ctrlBtn}>+15s</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: page.tsx recbar prop 교체**

```tsx
import RecordingBar from "@/components/Transcript/RecordingBar";

// AppShell의 recbar prop:
recbar={
  <RecordingBar
    isRecording={true}
    elapsedMs={35 * 60 * 1000 + 7000}
    onToggle={() => console.log("toggle")}
  />
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Transcript/RecordingBar.tsx src/components/Transcript/RecordingBar.module.css
git commit -m "feat(transcript): RecordingBar with speed control + seek"
```

---

## Task 9: NoteDocument 패널 (정적)

**Files:**
- Create: `src/components/NoteDoc/NoteDocument.tsx`
- Create: `src/components/NoteDoc/NoteDocument.module.css`

- [ ] **Step 1: NoteDocument.module.css 작성**

```css
/* src/components/NoteDoc/NoteDocument.module.css */
.doc {
  max-width: 760px;
  width: 100%;
  padding: 28px 36px 60px;
  margin: 0 auto;
}

/* 제목 */
.title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin-bottom: 8px;
  border: none;
  outline: none;
  width: 100%;
  background: transparent;
  font-family: inherit;
}
.title::placeholder { color: var(--ink-5); }

.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: var(--ink-3);
  margin-bottom: 24px;
  font-family: var(--font-mono);
}
.metaSep { color: var(--ink-5); }

/* 블록 */
.block {
  margin-bottom: 20px;
}
.blockHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 8px;
}
.blockIcon { font-size: 14px; }
.aiBadge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  background: linear-gradient(135deg, #ede9fe, #fce7f3);
  color: #7c3aed;
  border-radius: 4px;
  margin-left: 4px;
}

/* AI 요약 블록 */
.aiBlock {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 14px 16px;
}
.aiList {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.aiList li {
  display: flex;
  gap: 8px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink-2);
}
.aiList li::before {
  content: "•";
  color: var(--ink-4);
  flex-shrink: 0;
  margin-top: 1px;
}

/* 인용 블록 */
.quoteBlock {
  border-left: 2px solid var(--ink-5);
  padding: 8px 14px;
  background: var(--surface-2);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}
.quoteText {
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-2);
  font-style: italic;
}
.quoteSource {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--ink-4);
}
.quoteLink {
  color: var(--info);
  font-family: var(--font-mono);
  cursor: pointer;
}
.quoteLink:hover { text-decoration: underline; }

/* 생성 대기 블록 */
.generateBlock {
  padding: 12px 14px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--ink-4);
  font-size: 12.5px;
}
.generateBtn {
  padding: 5px 12px;
  background: var(--ink);
  color: #fff;
  border-radius: var(--r-sm);
  font-size: 12px;
  font-weight: 500;
  transition: filter 0.12s;
}
.generateBtn:hover { filter: brightness(1.2); }
.generateBtn:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 2: NoteDocument.tsx 작성**

```tsx
// src/components/NoteDoc/NoteDocument.tsx
"use client";

import styles from "./NoteDocument.module.css";

export interface NoteBlock {
  id: string;
  icon: string;
  title: string;
  type: "ai-summary" | "quote" | "generate";
  content?: string[];        // ai-summary용 불릿 목록
  quoteText?: string;        // quote용
  quoteSpeaker?: string;
  quoteTimestampMs?: number;
  onQuoteClick?: (ms: number) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
}

interface NoteDocumentProps {
  title: string;
  meta: string;              // "2026.05.05 · 오후 3:39 · 3명 참석"
  blocks: NoteBlock[];
  onTitleChange: (title: string) => void;
  onTimeClick?: (ms: number) => void;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

export default function NoteDocument({
  title,
  meta,
  blocks,
  onTitleChange,
  onTimeClick,
}: NoteDocumentProps) {
  return (
    <div className={styles.doc}>
      <input
        className={styles.title}
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="노트 제목"
      />
      <div className={styles.meta}>{meta}</div>

      {blocks.map((block) => (
        <div key={block.id} className={styles.block}>
          <div className={styles.blockHeader}>
            <span className={styles.blockIcon}>{block.icon}</span>
            {block.title}
            {(block.type === "ai-summary") && (
              <span className={styles.aiBadge}>AI 정리</span>
            )}
          </div>

          {block.type === "ai-summary" && block.content && (
            <div className={styles.aiBlock}>
              <ul className={styles.aiList}>
                {block.content.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {block.type === "quote" && (
            <div className={styles.quoteBlock}>
              <p className={styles.quoteText}>"{block.quoteText}"</p>
              {block.quoteSpeaker && (
                <div className={styles.quoteSource}>
                  <span>{block.quoteSpeaker}</span>
                  <span>→</span>
                  <button
                    className={styles.quoteLink}
                    onClick={() => block.quoteTimestampMs !== undefined && onTimeClick?.(block.quoteTimestampMs)}
                  >
                    {block.quoteTimestampMs !== undefined ? formatMs(block.quoteTimestampMs) : ""}
                  </button>
                </div>
              )}
            </div>
          )}

          {block.type === "generate" && (
            <div className={styles.generateBlock}>
              <span>녹음 종료 후 생성 가능</span>
              <button
                className={styles.generateBtn}
                disabled={block.isGenerating}
                onClick={block.onGenerate}
              >
                {block.isGenerating ? "생성 중..." : "AI 생성"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: page.tsx notedoc prop 교체**

```tsx
import NoteDocument from "@/components/NoteDoc/NoteDocument";

// AppShell의 notedoc prop:
notedoc={
  <NoteDocument
    title="생산 라인 점검"
    meta="2026.05.05 · 오후 3:39 · 3명 참석"
    onTitleChange={(t) => console.log(t)}
    blocks={[
      {
        id: "summary",
        icon: "●",
        title: "핵심 요약",
        type: "ai-summary",
        content: [
          "중국 공장 생산 라인의 용접 불량 문제가 3월 13일부터 발생.",
          "13일 이후 출하분의 품질 이슈 가능성 있음.",
          "전수 검사 시 2~3일 생산 지연 예상.",
        ],
      },
      {
        id: "context",
        icon: "□",
        title: "맥락 / 배경",
        type: "quote",
        quoteText: "중점적으로 마지막 파트 썼던 게 거의 3월 13일 그 무렵부터 지금 현재 쓰고 있는 문제가 생겼던 그 시기에 그거를 썼거든요.",
        quoteSpeaker: "화자 4",
        quoteTimestampMs: 63000,
      },
      {
        id: "action",
        icon: "☑",
        title: "액션 아이템",
        type: "generate",
      },
    ]}
  />
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/NoteDoc/
git commit -m "feat(notedoc): NoteDocument panel with AI summary + quote blocks"
```

---

## Task 10: ModelLoadingOverlay 컴포넌트

**Files:**
- Create: `src/components/Layout/ModelLoadingOverlay.tsx`
- Create: `src/components/Layout/ModelLoadingOverlay.module.css`

- [ ] **Step 1: ModelLoadingOverlay.module.css 작성**

```css
/* src/components/Layout/ModelLoadingOverlay.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(24, 24, 27, 0.4);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.card {
  width: 380px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-3);
  padding: 24px;
}

.heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--ink);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.subtitle {
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.5;
  margin-bottom: 18px;
}

.row { margin-bottom: 12px; }
.rowLabel {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--ink-2);
  margin-bottom: 5px;
}
.rowLabel strong {
  font-weight: 600;
  color: var(--ink);
}
.barTrack {
  height: 4px;
  background: var(--surface-3);
  border-radius: 2px;
  overflow: hidden;
}
.barFill {
  height: 100%;
  background: var(--ink);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.footer {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--ink-4);
  line-height: 1.5;
}
```

- [ ] **Step 2: ModelLoadingOverlay.tsx 작성**

```tsx
// src/components/Layout/ModelLoadingOverlay.tsx
import styles from "./ModelLoadingOverlay.module.css";

export interface ModelProgress {
  name: string;
  pct: number;     // 0–100
  loaded?: number; // bytes
  total?: number;  // bytes
}

interface ModelLoadingOverlayProps {
  models: ModelProgress[];
}

function fmtBytes(b?: number): string {
  if (!b) return "";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1024 / 1024).toFixed(0)}MB`;
}

export default function ModelLoadingOverlay({ models }: ModelLoadingOverlayProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.heading}>
          <span className={styles.spinner} />
          AI 모델 초기화 중
        </div>
        <p className={styles.subtitle}>
          최초 1회만 다운로드합니다. 이후에는 인터넷 없이 동작합니다.
        </p>

        {models.map((m) => (
          <div key={m.name} className={styles.row}>
            <div className={styles.rowLabel}>
              <span>{m.name}</span>
              <strong>
                {m.pct >= 100
                  ? "완료"
                  : m.loaded !== undefined && m.total !== undefined
                  ? `${fmtBytes(m.loaded)} / ${fmtBytes(m.total)}`
                  : `${m.pct}%`}
              </strong>
            </div>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${m.pct}%` }} />
            </div>
          </div>
        ))}

        <p className={styles.footer}>
          다운로드 완료 후 브라우저에 캐시되어 다음부터는 즉시 실행됩니다.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Layout/ModelLoadingOverlay.tsx src/components/Layout/ModelLoadingOverlay.module.css
git commit -m "feat(layout): ModelLoadingOverlay with per-model progress"
```

---

## Task 11: page.tsx — AppShell 완전 교체

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: page.tsx 전체 교체**

기존 `page.tsx`는 복잡한 form + STT 로직을 포함한다.
Phase 1에서는 AppShell UI 골격만 렌더링하고, 기존 로직은 `_page_legacy.tsx`로 백업한다.

```bash
cp src/app/page.tsx src/app/_page_legacy.tsx
```

- [ ] **Step 2: 새 page.tsx 작성**

```tsx
// src/app/page.tsx
"use client";

import { useState } from "react";
import AppShell from "@/components/Layout/AppShell";
import NoteList, { type NoteItem } from "@/components/Sidebar/NoteList";
import LiveTranscript, { type TranscriptTurn } from "@/components/Transcript/LiveTranscript";
import RecordingBar from "@/components/Transcript/RecordingBar";
import NoteDocument, { type NoteBlock } from "@/components/NoteDoc/NoteDocument";
import ModelLoadingOverlay from "@/components/Layout/ModelLoadingOverlay";

// Phase 1 더미 데이터 — Phase 2에서 실제 데이터로 교체
const SAMPLE_NOTES: NoteItem[] = [
  { id: "n1", title: "생산 라인 점검", time: "오후 3:39", duration: "35:07", isRecording: true, elapsed: "00:35:07" },
  { id: "n2", title: "Q2 예산 검토", time: "오전 10:15", duration: "22:14" },
  { id: "n3", title: "신입 온보딩 1on1", time: "오전 9:00", duration: "12:48" },
];

const SAMPLE_TURNS: TranscriptTurn[] = [
  { id: "t1", speakerLabel: "김태현", text: "아이고 괜히 뭐 그것 때문에 온 건 아니고요. 대표님 그거 중에 60 몇 명이라고 하더라고요.", startMs: 5000 },
  { id: "t2", speakerLabel: "이영석", text: "정확한 수치가 안 나와요. 지금 저희도 중국 공장하고 통화를 하고 있는데 기계가 5대가 돌고 있는데...", startMs: 27000 },
  { id: "t3", speakerLabel: "김태현", text: "근데 기존에는 없었는데 이번에 있었던 건 이번 것만 그렇다라고 추정을 해야 되니.", startMs: 48000 },
  { id: "t4", speakerLabel: "이영석", text: "예상으로는 2~3일 정도 소요될 것 같고요.", startMs: 118000, isLive: true },
];

const SAMPLE_BLOCKS: NoteBlock[] = [
  {
    id: "b1", icon: "●", title: "핵심 요약", type: "ai-summary",
    content: [
      "중국 공장 생산 라인의 용접 불량 문제가 3월 13일부터 발생.",
      "13일 이후 출하분의 품질 이슈 가능성 있음.",
      "전수 검사 시 2~3일 생산 지연 예상.",
    ],
  },
  {
    id: "b2", icon: "□", title: "맥락 / 배경", type: "quote",
    quoteText: "중점적으로 마지막 파트 썼던 게 거의 3월 13일 그 무렵부터 지금 쓰고 있는 문제가 생겼던 그 시기에 그거를 썼거든요.",
    quoteSpeaker: "화자 4", quoteTimestampMs: 63000,
  },
  { id: "b3", icon: "☑", title: "액션 아이템", type: "generate" },
];

export default function Home() {
  const [activeNoteId, setActiveNoteId] = useState("n1");
  const [noteTitle, setNoteTitle] = useState("생산 라인 점검");

  // Phase 2에서 실제 model loading 상태로 교체
  const showModelOverlay = false;

  return (
    <>
      {showModelOverlay && (
        <ModelLoadingOverlay
          models={[
            { name: "Whisper Base (음성 인식)", pct: 58, loaded: 43_000_000, total: 74_000_000 },
            { name: "WeSpeaker (화자 구분)", pct: 0 },
          ]}
        />
      )}
      <AppShell
        noteTitle={noteTitle}
        isRecording={true}
        elapsed="00:35:07"
        sidebar={
          <NoteList
            items={SAMPLE_NOTES}
            activeId={activeNoteId}
            onSelect={setActiveNoteId}
            onNewRecording={() => console.log("new recording")}
          />
        }
        transcript={
          <LiveTranscript
            turns={SAMPLE_TURNS}
            keywords={[
              { word: "3월 13일", count: 4 },
              { word: "전수 검사", count: 3 },
              { word: "용접 불량", count: 3 },
              { word: "중국 공장", count: 2 },
            ]}
            elapsed="35:07"
            isRecording={true}
          />
        }
        recbar={
          <RecordingBar
            isRecording={true}
            elapsedMs={35 * 60 * 1000 + 7000}
            onToggle={() => console.log("toggle")}
          />
        }
        notedoc={
          <NoteDocument
            title={noteTitle}
            meta="2026.05.05 · 오후 3:39 · 3명 참석"
            blocks={SAMPLE_BLOCKS}
            onTitleChange={setNoteTitle}
          />
        }
      />
    </>
  );
}
```

- [ ] **Step 3: 브라우저 전체 확인**

```bash
npm run dev
```

확인 항목:
- 3단 레이아웃 렌더링 (사이드바 240px / 트랜스크립트 380px / 노트 문서 나머지)
- 사이드바: "생산 라인 점검" 빨간 점 + 타이머 표시
- 트랜스크립트: 화자별 색상 버블 (인디고/틸), 타이핑 커서 애니메이션
- 키워드 칩 클릭 토글
- 노트 문서: AI 요약 블록, 인용 블록 렌더링
- 하단 녹음바: 타이머, 진행 바

- [ ] **Step 4: TypeScript 타입 에러 확인**

```bash
npx tsc --noEmit 2>&1 | head -40
```

에러가 있으면 수정 후 재확인.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/_page_legacy.tsx
git commit -m "feat: Phase 1 complete — V2 UI shell with AppShell + all static components"
```

---

## ✅ Phase 1 완료 체크

```
□ 3단 레이아웃 (240px / 380px / 나머지) 정상 렌더링
□ V2 Granola 컬러 시스템 적용 (#fafaf9 배경, #18181b 잉크)
□ Pretendard 폰트 로드 확인
□ 사이드바 노트 목록 + 녹음 중 표시
□ 트랜스크립트 화자 버블 (인디고, 틸, 앰버, 핑크)
□ 키워드 칩 선택 토글
□ 하단 녹음 바 (타이머 + 속도 조절)
□ 노트 문서 (AI 요약 블록, 인용 블록)
□ ModelLoadingOverlay 컴포넌트 존재 (아직 표시 안 함)
□ TypeScript 에러 0개
□ 빌드 성공 (npm run build)
```

---

## 다음 단계

**Phase 2** (`2026-05-05-autonote-v2-phase2-stt-workers.md`):
- `src/lib/audioSlice.ts` + 테스트
- `src/lib/speakerCluster.ts` + 테스트
- `src/workers/whisper.worker.ts`
- `src/workers/speaker.worker.ts`
- `src/hooks/useOfflineSTT.ts`

**Phase 3** (`2026-05-05-autonote-v2-phase3-integration.md`):
- `src/lib/db.ts` IndexedDB
- 녹음 → 실시간 트랜스크립트 연결
- 노트 저장/불러오기
- AI 분석 블록 생성
