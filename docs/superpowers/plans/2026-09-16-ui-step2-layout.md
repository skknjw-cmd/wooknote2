# 2단계: 레이아웃 재편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 트랜스크립트를 메인 화면으로 올리고, `NoteDocument`(818줄)를 회의 정보 패널 · Notion 상태 패널 · 분석 오버레이 셋으로 쪼갠다.

**Architecture:** `AppShell`의 2열 배치(`트랜스크립트 380px | NoteDocument flex:1`)를 뒤집어 `LiveTranscript flex:1 | 오른쪽 패널 320px`로 만든다. 분석 블록 6개는 전체 화면 오버레이로 옮겨 기본 화면에서 빠진다. 겹쳐 있던 review 배너는 아래쪽 액션 바가 된다. **새 기능은 없다 — 있던 것을 옮기고 죽은 것을 지운다.**

**Tech Stack:** Next.js 16 App Router · TypeScript · React 19 · vitest

**Spec:** `docs/superpowers/specs/2026-09-16-ui-restructure-design.md` (2단계 절)

## Global Constraints

- **`node_modules/next/dist/docs/`를 먼저 읽는다.** 이 저장소의 `AGENTS.md`: "This is NOT the Next.js you know ... Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."
- **이 저장소에는 UI 테스트가 0개다.** 단위 테스트는 순수 함수만 덮는다. 이 계획의 Task 대부분은 **자동 검증이 `tsc` + `build` + 기존 스위트뿐**이다. 없는 테스트를 있다고 쓰지 않는다
- **브라우저가 없는 환경이다.** 어떤 커밋 메시지·주석·문서도 수행하지 않은 검증을 주장해서는 안 된다. 수동 확인 항목은 "하지 않음"으로 보고한다
- **검증 명령 3종:** `npx tsc --noEmit` · `npx vitest run` · `npm run build`
- **테스트 기준선: `0 failed | 124 passed (124)`.** 이 계획은 테스트를 추가하지도 삭제하지도 않는다. 숫자가 바뀌면 멈추고 보고한다
- `tsc`가 `.next/` 안을 가리키는 에러를 내면 gitignore된 빌드 캐시다 — `rm -rf .next` 후 재실행
- **디자인 토큰만 쓴다.** 색·반경·그림자는 `src/app/globals.css`의 `:root` 변수(`--ink-1~5`, `--surface`, `--border`, `--r-sm/md/lg`, `--sp1~4`, `--rec`)로. 새 색을 리터럴로 박지 않는다
- **스타일은 `globals.css`의 이름 있는 클래스로 쓴다.** 인라인 `style={{...}}` 객체를 새로 만들지 않는다. 남는 폭·접힘 폭처럼 **상태에 따라 계산되는 값만** 인라인으로 둔다.
  스펙은 "`AppShell`의 인라인 스타일을 CSS Module로 옮긴다"고 적었지만, **1단계에서 이 저장소의 `.module.css` 13개가 전부 삭제되어 남은 것이 하나도 없다.** 지금 새로 만들면 방금 걷어낸 패턴을 되살리는 셈이다. 3단계(CLAUDE DESIGN)가 실제로 요구하는 것은 파일 위치가 아니라 **스타일에 이름이 있어 뽑아낼 수 있는 것**이므로, 이미 디자인 시스템 전체를 담고 있는 `globals.css`에 클래스를 더한다. 스펙의 문구와 다른 선택이므로 PR에 적는다
- **Windows / Git Bash.** 파일 삭제는 `git rm`
- **브랜치:** `feat/ui-step2-layout`을 `main`에서 딴다
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## 지금 구조 (출발점)

```
AppShell
├ topbar   — 사이드바 토글 · 제목 input(1단계에서 연결됨) · REC pill · [다시 정리] · [내보내기]
├ NoteList (사이드바)
└ main flex
  ├ review 배너  position:absolute top:0  ← [이어 녹음][Notion 갱신][내보내기][저장]
  ├ 트랜스크립트 380px (LiveTranscript)
  ├ 접기 핸들 16px
  └ NoteDocument flex:1  paddingTop:44
     ├ <h1> 제목 (contentEditable)
     ├ doc-meta (생성 시각 · "녹음 중")
     ├ PropRow ×3 — 회의 일시 · 회의 장소 · 참석자
     ├ Block 1 AI 정리(핵심 요약)  ← "새 발화 N개" 배지 · [다시 정리] 버튼
     ├ Block 2 주요 논의 내용
     ├ Block 3 결정사항
     ├ Block 4 해야 할 일
     ├ Block 5 미결정사항
     ├ Block 6 향후 일정
     ├ Block 7 자유 메모
     └ [+ 블록 추가] 버튼 (onClick 없음 — 죽은 버튼)
```

## 목표 구조

```
AppShell
├ topbar   — 사이드바 토글 · 제목 input · REC pill · Notion 상태 칩 · [내보내기]
├ NoteList
├ main flex
│ ├ LiveTranscript flex:1
│ ├ 접기 핸들 16px
│ └ 오른쪽 패널 320px
│    ├ MeetingInfoPanel   — 일시 · 장소 · 참석자 · 소요시간 · 자유 메모
│    └ NotionStatusPanel  — 상태 · 페이지 링크 · [Notion 갱신] · 건너뛴 속성 · [다시 정리]
├ ActionBar (mode === "review")  — 경과 시간 · [이어 녹음][내보내기][저장]
└ AnalysisView (오버레이, 열렸을 때만)
```

---

### Task 0: 브랜치와 기준선

**Files:** 없음 (git)

**Interfaces:**
- Consumes: 없음
- Produces: 브랜치 `feat/ui-step2-layout`, 기준선 수치

- [ ] **Step 1: 브랜치를 만든다**

```bash
cd /c/dev/autonote
git checkout main
git pull --ff-only
git checkout -b feat/ui-step2-layout
```

- [ ] **Step 2: 기준선**

```bash
npx vitest run 2>&1 | tail -4
npx tsc --noEmit && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: `0 failed | 124 passed (124)` · `✓ Compiled successfully`

**다른 숫자가 나오면 멈추고 보고한다.**

---

### Task 1: `AnalysisView` — 분석 블록 6개를 오버레이로

`NoteDocument`의 블록 1~6을 새 컴포넌트로 옮긴다. **로직을 새로 쓰지 않는다 — 옮긴다.**

**Files:**
- Create: `src/components/Analysis/AnalysisView.tsx`
- Read (복사 원본, 이 Task에서는 수정하지 않음): `src/components/NoteDoc/NoteDocument.tsx`

**Interfaces:**
- Consumes: `NoteRecord`, `Participant`, `DiscussionItem` (모두 `@/types/meeting`)
- Produces:
```ts
export interface AnalysisViewProps {
  note: NoteRecord | null;
  participants: Participant[];
  pendingTurnCount?: number;
  analyzing?: boolean;
  onRegen?: () => void;
  onUpdateNote?: (note: NoteRecord) => void;
  onClose: () => void;
}
export default function AnalysisView(props: AnalysisViewProps): React.JSX.Element
```

- [ ] **Step 1: 원본을 읽는다**

```bash
cd /c/dev/autonote
sed -n '1,120p' src/components/NoteDoc/NoteDocument.tsx    # import, 아이콘, PropRow, 파서
sed -n '240,360p' src/components/NoteDoc/NoteDocument.tsx  # props, useState, 핸들러
sed -n '443,793p' src/components/NoteDoc/NoteDocument.tsx  # 블록 1~6
```

블록 1~6과 그것들이 쓰는 것만 가져간다. 다음은 **가져가지 않는다**: `<h1>` 제목, `doc-meta`, `PropRow`와 그 호출 3개, 블록 7(자유 메모), `[+ 블록 추가]` 버튼(`onClick`이 없는 죽은 버튼).

- [ ] **Step 2: `AnalysisView.tsx`를 만든다**

껍데기는 이렇게 시작한다. 안쪽 블록은 원본에서 **그대로** 옮긴다.

```tsx
"use client";

import React, { useState, useEffect } from "react";
import type { NoteRecord, Participant, DiscussionItem } from "@/types/meeting";

export interface AnalysisViewProps {
  note: NoteRecord | null;
  participants: Participant[];
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
 * "요약이 없습니다"가 화면 대부분을 차지한다. 여기 블록들은 NoteDocument에서 그대로
 * 옮겨 온 것이라 편집 동작(contentEditable · 할 일 추가 · 체크박스)이 예전과 같다.
 */
export default function AnalysisView({
  note,
  participants,
  pendingTurnCount = 0,
  analyzing = false,
  onRegen,
  onUpdateNote,
  onClose,
}: AnalysisViewProps) {
  // Esc로 닫는다. 전체 화면을 덮으므로 빠져나갈 길이 분명해야 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // …원본의 useState / 핸들러 / 블록 1~6…

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="AI 분석 결과">
      <div className="overlay-h">
        <b>분석 결과</b>
        <div className="spacer" />
        <button className="btn" onClick={onClose}>닫기</button>
      </div>
      <div className="overlay-body">
        {/* 블록 1~6 */}
      </div>
    </div>
  );
}
```

그리고 `src/app/globals.css` 끝에 이 클래스들을 더한다. 토큰만 쓴다.

```css
/* ── 전체 화면 오버레이 (AnalysisView) ───────────────────────── */
.overlay {
  position: fixed; inset: 0; z-index: 100;
  background: var(--surface);
  display: flex; flex-direction: column;
}
.overlay-h {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0; font-size: 14px;
}
.overlay-h .spacer { flex: 1; }
.overlay-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
```

옮겨 오는 블록 1~6이 쓰던 클래스(`nblock` · `nblock-h` · `ai-block` · `badge-ai` 등)는 `globals.css`에 이미 있다. 새로 만들지 않는다.

`onUpdateNote`를 부르는 자리는 원본과 **한 글자도 다르지 않게** 옮긴다. 편집 동작이 바뀌면 이 Task의 목적이 아니다.

- [ ] **Step 3: 컴파일만 확인한다** (아직 아무도 쓰지 않는다)

```bash
npx tsc --noEmit
```

기대: 출력 없음. `NoteDocument`는 아직 그대로이므로 화면은 변하지 않는다.

- [ ] **Step 4: 빌드와 테스트**

```bash
npm run build 2>&1 | grep -E "✓ Compiled|error" && npx vitest run 2>&1 | tail -3
```

기대: `✓ Compiled successfully` · `124 passed`

- [ ] **Step 5: 커밋**

```bash
git add src/components/Analysis/AnalysisView.tsx src/app/globals.css
git commit -m "$(cat <<'MSG'
feat(ui): 분석 블록을 AnalysisView 오버레이로 옮긴다

NoteDocument의 블록 1~6(핵심 요약·주요 논의·결정사항·해야 할 일·미결정사항·
향후 일정)을 전체 화면 오버레이 컴포넌트로 옮겼다. 편집 동작은 원본을 그대로
가져와 바뀌지 않았다.

아직 아무도 이 컴포넌트를 쓰지 않는다 — 배선은 다음 커밋에서 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: `MeetingInfoPanel` — 회의 정보와 자유 메모

**Files:**
- Create: `src/components/NoteDoc/MeetingInfoPanel.tsx`
- Read (원본, 수정하지 않음): `src/components/NoteDoc/NoteDocument.tsx`

**Interfaces:**
- Consumes: `NoteRecord`, `Participant`
- Produces:
```ts
export interface MeetingInfoPanelProps {
  note: NoteRecord | null;
  participants: Participant[];
  onUpdateNote?: (note: NoteRecord) => void;
}
export default function MeetingInfoPanel(props: MeetingInfoPanelProps): React.JSX.Element
```

- [ ] **Step 1: 원본에서 가져올 부분을 읽는다**

```bash
cd /c/dev/autonote
sed -n '77,115p' src/components/NoteDoc/NoteDocument.tsx    # PropRow
sed -n '360,442p' src/components/NoteDoc/NoteDocument.tsx    # doc-meta, PropRow 호출 3개
sed -n '794,812p' src/components/NoteDoc/NoteDocument.tsx    # 블록 7 자유 메모
sed -n '62,76p'  src/components/NoteDoc/NoteDocument.tsx     # formatDateTime
```

- [ ] **Step 2: 소요시간을 어떻게 만드는지 확인한다**

```bash
grep -n "formatDuration" src/lib/notionSave.ts
grep -n "audioDuration" src/types/meeting.ts
```

`notionSave.ts`에 `formatDuration(ms)`가 있지만 **export되지 않았다.** 이 패널에서 `NoteRecord.audioDuration`을 사람이 읽는 문자열로 바꿔야 한다.

`notionSave.ts`의 `formatDuration`을 `export`로 바꾸고 여기서 import한다. 복사해서 두 벌을 만들지 않는다 — Notion에 나가는 값과 화면에 보이는 값이 갈라지면 안 된다.

- [ ] **Step 3: `MeetingInfoPanel.tsx`를 만든다**

```tsx
"use client";

import React from "react";
import type { NoteRecord, Participant } from "@/types/meeting";
import { formatDuration } from "@/lib/notionSave";

export interface MeetingInfoPanelProps {
  note: NoteRecord | null;
  participants: Participant[];
  onUpdateNote?: (note: NoteRecord) => void;
}

/**
 * 회의 일시·장소·참석자·소요시간과 자유 메모.
 *
 * 여기 있는 값들은 Notion으로 실제 나가는 값이다(장소는 속성이 아니라 트랜스크립트 맨 위
 * "회의 정보" 줄에 실린다). 그래서 사용자가 저장 전에 고칠 수 있어야 한다.
 * 제목은 여기 없다 — 헤더 입력 하나가 유일한 제목 입력구다.
 */
export default function MeetingInfoPanel({ note, participants, onUpdateNote }: MeetingInfoPanelProps) {
  // …PropRow 3개 + 소요시간 행 + 자유 메모…
}
```

`PropRow`는 원본에서 그대로 옮긴다. 소요시간은 **읽기 전용**이다(녹음 길이에서 나온 값이라 사람이 고칠 것이 아니다). `note.audioDuration`이 0이면 그 행을 렌더하지 않는다.

- [ ] **Step 4: `formatDuration`을 export한다**

`src/lib/notionSave.ts`에서

```ts
function formatDuration(ms: number): string {
```

를

```ts
/** ms → "1:23:45" 또는 "2:05". 0이면 빈 문자열. 화면 표시와 Notion 저장이 같은 값을 쓴다. */
export function formatDuration(ms: number): string {
```

로 바꾼다. 본문은 건드리지 않는다.

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: 통과 · `124 passed` · `✓ Compiled successfully`

`notionSave.test.ts`가 있으므로 `formatDuration`의 export 전환이 기존 테스트를 깨지 않는지 여기서 드러난다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(ui): 회의 정보와 자유 메모를 MeetingInfoPanel로 뽑는다

NoteDocument의 속성 행 3개(일시·장소·참석자)와 자유 메모 블록을 오른쪽 패널용
컴포넌트로 옮기고, 소요시간 행을 더했다. 제목은 가져오지 않는다 — 1단계에서
헤더 입력을 연결했으므로 제목 입력구는 하나뿐이다.

소요시간 표시는 notionSave.ts의 formatDuration을 export해 재사용한다. 복사해
두 벌을 만들면 화면에 보이는 값과 Notion에 나가는 값이 갈라진다.

아직 아무도 이 컴포넌트를 쓰지 않는다 — 배선은 다음 커밋에서 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: `NotionStatusPanel` — 상태를 배너에서 패널로

지금 Notion 상태는 `review` 모드에서만 뜨는 배너 한 줄이다. Notion이 실질적 목적지이므로 **상시 보이는 패널**로 옮긴다.

**Files:**
- Create: `src/lib/notionPageUrl.ts`
- Create: `src/lib/notionPageUrl.test.ts`
- Create: `src/components/Notion/NotionStatusPanel.tsx`
- Read (원본, 수정하지 않음): `src/components/Layout/AppShell.tsx`의 `bannerText`

순수 함수는 `src/lib/`에 두고 그 옆에서 테스트한다 — 이 저장소의 기존 방식이다(`notionBlocks` · `notionErrors` · `turnAssembly` 전부 그렇다). 컴포넌트 파일에서 export하면 테스트가 React를 끌고 들어온다.

**Interfaces:**
- Consumes: `NotionSaveState` (`@/types/meeting`), `NoteRecord.notionPageId`
- Produces:
```ts
// src/lib/notionPageUrl.ts
/** Notion 페이지 id → 열 수 있는 URL. id가 없으면 null. */
export function notionPageUrl(pageId?: string): string | null

// src/components/Notion/NotionStatusPanel.tsx
export interface NotionStatusPanelProps {
  status: NotionSaveState;
  notionPageId?: string;
  syncedTurns?: number;
  totalTurns: number;
  onRetry?: () => void;
  onSettings?: () => void;
  onOpenAnalysis: () => void;
  analyzing?: boolean;
}
export default function NotionStatusPanel(props: NotionStatusPanelProps): React.JSX.Element
```

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`notionPageUrl`은 순수 함수이므로 테스트할 수 있다. 이 저장소의 lib 테스트 방식을 그대로 따른다.

Create `src/lib/notionPageUrl.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { notionPageUrl } from "./notionPageUrl";

describe("notionPageUrl", () => {
  it("하이픈 있는 id에서 하이픈을 뺀 URL을 만든다", () => {
    expect(notionPageUrl("1a2b3c4d-5e6f-7890-abcd-ef1234567890"))
      .toBe("https://notion.so/1a2b3c4d5e6f7890abcdef1234567890");
  });

  it("하이픈 없는 id도 그대로 받는다", () => {
    expect(notionPageUrl("1a2b3c4d5e6f7890abcdef1234567890"))
      .toBe("https://notion.so/1a2b3c4d5e6f7890abcdef1234567890");
  });

  it("id가 없으면 null", () => {
    expect(notionPageUrl(undefined)).toBeNull();
    expect(notionPageUrl("")).toBeNull();
  });

  it("공백만 있으면 null", () => {
    expect(notionPageUrl("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

```bash
cd /c/dev/autonote
npx vitest run src/lib/notionPageUrl.test.ts 2>&1 | tail -6
```

기대: 모듈을 찾을 수 없어 FAIL.

- [ ] **Step 3: `notionPageUrl.ts`와 `NotionStatusPanel.tsx`를 만든다**

`src/lib/notionPageUrl.ts`:

```ts
/**
 * Notion 페이지 id → 열 수 있는 URL. id가 없으면 null.
 *
 * Notion은 하이픈이 있든 없든 같은 페이지를 열어 주지만, 저장된 id의 모양이
 * 경로에 따라 다르므로(생성 응답은 하이픈 있음) 한 가지로 맞춰 둔다.
 */
export function notionPageUrl(pageId?: string): string | null {
  const id = (pageId ?? "").trim().replace(/-/g, "");
  if (!id) return null;
  return `https://notion.so/${id}`;
}
```

패널 본문은 `AppShell`의 `bannerText`가 만들던 문구를 **그대로** 쓴다. 문구를 새로 지어내면 1단계에서 맞춰 놓은 사실관계가 다시 갈라진다. 담을 것:

- 상태 아이콘과 한 줄 문구 (`bannerText`에서 가져옴)
- `건너뛴 속성`이 있으면 그 목록
- `notionPageUrl`이 null이 아니면 `Notion에서 열기 ↗` 링크 (`target="_blank" rel="noopener noreferrer"`)
- `syncedTurns`가 있으면 `발화 {syncedTurns}/{totalTurns} 동기화`
- `[Notion 갱신]` / `[다시 시도]` 버튼 — 지금 `AppShell`이 쓰는 `canResend` / `canRetry` 조건을 그대로
- `unconfigured`면 `[설정]`
- 맨 아래 `[다시 정리]` — `onOpenAnalysis` 호출, `analyzing`이면 비활성화

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

```bash
npx vitest run src/lib/notionPageUrl.test.ts 2>&1 | tail -4
```

기대: 4개 통과.

- [ ] **Step 5: 전체 검증**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: 통과 · **`128 passed`** (124 + 새 테스트 4) · `✓ Compiled successfully`

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(ui): Notion 상태를 상시 표시 패널로 뽑는다

지금 Notion 상태는 review 모드에서만 뜨는 배너 한 줄이다. 저장이 끝난 뒤에만
보이므로 늦다 — Notion이 이 앱의 실질적 목적지이므로 상시 보여야 한다.

문구는 AppShell의 bannerText를 그대로 쓴다. 새로 지어내면 1단계에서 맞춰 놓은
사실관계가 다시 갈라진다.

notionPageId로 페이지 링크를 만들어 건다. notionPageUrl 단위 테스트 4개.

아직 아무도 이 컴포넌트를 쓰지 않는다 — 배선은 다음 커밋에서 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: `AppShell` 재배선 — 여기서 화면이 바뀐다

앞의 셋을 실제로 꽂고, `NoteDocument`를 지운다. **이 계획에서 유일하게 화면이 바뀌는 Task다.**

**Files:**
- Modify: `src/components/Layout/AppShell.tsx`
- Create: `src/components/Layout/ActionBar.tsx`
- Delete: `src/components/NoteDoc/NoteDocument.tsx`

**Interfaces:**
- Consumes: Task 1·2·3이 만든 세 컴포넌트의 props (위에 적힌 그대로)
- Produces:
```ts
export interface ActionBarProps {
  mode: "live" | "review";
  elapsedMs: number;
  isRecording: boolean;
  onToggleRecording: () => void;
  onExport: () => void;
  onSave?: () => void;
}
export default function ActionBar(props: ActionBarProps): React.JSX.Element | null
```

- [ ] **Step 1: `ActionBar.tsx`를 만든다**

`mode !== "review"`면 `null`을 돌려준다. review일 때 아래쪽 가로 바로 `[이어 녹음] [내보내기] [저장]`과 경과 시간을 낸다. `[Notion 갱신]`은 **여기 두지 않는다** — `NotionStatusPanel`에 있고, 버튼이 둘이면 어느 쪽이 무엇인지 알 수 없다.

경과 시간 포맷은 `LiveTranscript`가 쓰는 것을 찾아 맞춘다:

```bash
grep -n "elapsedMs" src/components/Recording/LiveTranscript.tsx src/components/Recording/RecordingBar.tsx
```

- [ ] **Step 2: `AppShell`의 main 영역을 바꾼다**

지금 `AppShell.tsx`의 `{/* Main area: transcript + note doc */}` 블록(대략 231~340행)을 이 구조로 바꾼다.

```tsx
      {/* Main area: 트랜스크립트가 주인공, 오른쪽에 정보 패널 */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* 트랜스크립트 — 남는 폭 전부 */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {transcriptSlot ?? (
              <LiveTranscript
                turns={turns}
                keywords={keywords}
                participants={participants}
                mode={mode}
                isRecording={isRecordingThisNote}
                elapsedMs={elapsedMs}
                sttError={sttError}
                onToggleRecording={onToggleRecording}
                onSpeakerName={onSpeakerName}
                onToggleKeyword={onToggleKeyword}
                onEditTurn={onEditTurn}
                onSplitTurn={onSplitTurn}
                reviewOffset={0}
              />
            )}
          </div>

          {/* 접기 핸들 — 지금 쓰는 버튼을 그대로 옮기되 방향만 뒤집는다 */}
          {/* …기존 핸들 버튼… */}

          {/* 오른쪽 패널 */}
          <div style={{
            width: panelCollapsed ? 0 : 320,
            flexShrink: 0,
            overflow: "hidden",
            overflowY: panelCollapsed ? "hidden" : "auto",
            transition: "width 0.2s ease",
            borderLeft: panelCollapsed ? "none" : "1px solid var(--border)",
          }}>
            <MeetingInfoPanel note={currentNote} participants={participants} onUpdateNote={onUpdateNote} />
            <NotionStatusPanel
              status={notionStatus}
              notionPageId={currentNote?.notionPageId}
              syncedTurns={currentNote?.notionSyncedTurns}
              totalTurns={currentNote?.segments.length ?? 0}
              onRetry={onRetryNotion}
              onSettings={onSettings}
              onOpenAnalysis={() => setAnalysisOpen(true)}
              analyzing={analyzing}
            />
          </div>
        </div>

        <ActionBar
          mode={mode}
          elapsedMs={elapsedMs}
          isRecording={isRecordingThisNote}
          onToggleRecording={onToggleRecording}
          onExport={onExport}
          onSave={onSave}
        />
      </div>
```

상태 이름을 `transcriptCollapsed` → `panelCollapsed`로 바꾼다(접는 대상이 뒤바뀌었으므로). 핸들의 화살표 방향과 `title` 문구도 뒤집는다.

- [ ] **Step 3: 오버레이를 연결한다**

`AppShell` 안에 `const [analysisOpen, setAnalysisOpen] = useState(false);`를 더하고, `ModelLoadingOverlay` 위에 낸다.

```tsx
      {analysisOpen && (
        <AnalysisView
          note={currentNote}
          participants={participants}
          pendingTurnCount={pendingTurnCount}
          analyzing={analyzing}
          onRegen={onRegen}
          onUpdateNote={onUpdateNote}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
```

헤더의 `[다시 정리]` 버튼(대략 195행)은 **`setAnalysisOpen(true)`로 바꾼다.** 분석을 바로 돌리지 않고 화면부터 연다 — 결과를 볼 곳이 있어야 누른 보람이 있다. 실제 분석은 `AnalysisView` 안의 버튼이 `onRegen`으로 돌린다.

- [ ] **Step 4: 헤더에 Notion 상태 칩을 단다**

헤더의 `actions` 안, `[내보내기]` 왼쪽에 한 줄짜리 상태 칩을 넣는다. `NotionStatusPanel`이 쓰는 것과 **같은 아이콘**을 쓰되 문구는 짧게(`저장됨` / `저장 중…` / `실패` / `미설정`). 클릭하면 오른쪽 패널을 편다(`setPanelCollapsed(false)`).

- [ ] **Step 5: 겹침 보정을 걷어낸다**

- `review-banner`를 쓰던 `position:absolute` 블록 삭제
- `NoteDocument`를 감싸던 `paddingTop: mode === "review" ? 44 : 0` 삭제
- `LiveTranscript`의 `reviewOffset`을 `0`으로 (배너가 더는 겹치지 않는다)

`reviewOffset`이 이제 항상 0이면 prop 자체를 지울지 확인한다:

```bash
grep -n "reviewOffset" src/components/Recording/LiveTranscript.tsx
```

- [ ] **Step 6: `NoteDocument`를 지운다**

```bash
grep -rn "NoteDocument" src --include=*.tsx
```

`AppShell`의 import 말고 남는 참조가 없으면:

```bash
git rm src/components/NoteDoc/NoteDocument.tsx
```

- [ ] **Step 7: 고아 CSS를 확인한다**

```bash
for c in nblock nblock-h doc-meta note-props prop-label add-block ai-block badge-ai review-banner; do
  echo "-- $c: $(grep -rl "$c" src --include=*.tsx | tr '\n' ' ')"
done
grep -n "nblock\|doc-meta\|note-props\|add-block\|review-banner" src/app/globals.css | head -20
```

`AnalysisView`·`MeetingInfoPanel`이 계속 쓰는 클래스는 남긴다. 아무 `.tsx`도 안 쓰는 것만 `globals.css`에서 지운다. **이번에 고아가 된 것만** — 이전부터 안 쓰던 것은 범위 밖이다.

- [ ] **Step 8: 검증**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: 통과 · `128 passed` · `✓ Compiled successfully`

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "$(cat <<'MSG'
feat(ui): 트랜스크립트를 메인으로 올리고 NoteDocument를 걷어낸다

분석을 끈 뒤로 메인 패널은 "요약이 없습니다" 세 줄이었고, 실제 결과물인
트랜스크립트는 380px 사이드에 갇혀 있었다. 배치를 뒤집는다.

- LiveTranscript가 남는 폭 전부를 쓴다
- 오른쪽 320px에 MeetingInfoPanel + NotionStatusPanel
- 아래쪽 ActionBar — review 배너의 position:absolute 겹침과 본문의
  paddingTop:44 보정을 함께 없앴다
- 헤더에 Notion 상태 칩(상시). [다시 정리]는 분석을 바로 돌리지 않고
  AnalysisView를 연다 — 결과를 볼 곳이 있어야 누른 보람이 있다
- NoteDocument(818줄) 삭제. 제목 <h1>은 되살리지 않는다. 헤더 입력이
  유일한 제목 입력구다

브라우저 확인은 이 세션에서 하지 않았다 — 이 저장소에는 UI 테스트가 없고
실행할 브라우저도 없다. 사람이 확인해야 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: 마무리 — 문서와 전체 검증

**Files:** `README.md`

**Interfaces:**
- Consumes: Task 1~4
- Produces: PR 준비된 브랜치

- [ ] **Step 1: 전체 검증**

```bash
cd /c/dev/autonote
rm -rf .next
npx tsc --noEmit && npx vitest run 2>&1 | tail -5 && npm run build 2>&1 | tail -20
```

기대: 통과 · `0 failed | 128 passed` · `✓ Compiled successfully`

- [ ] **Step 2: 죽은 참조가 남았는지 본다**

```bash
grep -rn "NoteDocument\|transcriptCollapsed\|reviewOffset\|review-banner" src --include=*.tsx --include=*.ts
grep -n "NoteDocument\|분석 문서" README.md
```

나오는 것이 있으면 정리한다.

- [ ] **Step 3: README를 실제와 맞춘다**

화면 구성을 설명하는 문장이 있으면 새 배치로 고친다. 없으면 그대로 둔다. **없는 것을 지어내 쓰지 않는다.**

- [ ] **Step 4: 커밋하고 멈춘다**

```bash
git add -A
git commit -m "docs: 2단계 레이아웃을 README에 반영

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**푸시하지 않는다. PR을 만들지 않는다.** 사람이 브라우저로 확인한 뒤에 한다.

---

## 사람이 브라우저로 확인해야 하는 것

자동 검증이 닿지 않는다. 이 계획의 실제 수용 기준이다.

| # | 확인 |
|---|---|
| 1 | 녹음 시작 → 트랜스크립트가 **화면 대부분**을 차지하는가 |
| 2 | 오른쪽 패널의 일시·장소·참석자를 고치면 저장되는가 |
| 3 | 자유 메모를 쓰고 노트를 옮겼다 돌아오면 남아 있는가 |
| 4 | 소요시간이 실제 녹음 길이와 맞는가 |
| 5 | 저장 뒤 `Notion에서 열기 ↗`가 **그 회의의 페이지**를 여는가 |
| 6 | `[다시 정리]` → 오버레이가 뜨고, 그 안의 버튼이 분석을 돌리고, `닫기`와 `Esc`로 닫히는가 |
| 7 | 오버레이 안에서 요약·결정사항을 고치면 저장되는가 |
| 8 | 아래 `[이어 녹음]`이 같은 Notion 페이지에 이어 붙이는가 |
| 9 | 패널 접기 핸들이 오른쪽 패널을 접는가 |
| 10 | 창을 좁혔을 때 3열이 무너지지 않는가 |

## 실행 중 멈춰야 하는 신호

| 신호 | 뜻 |
|---|---|
| 테스트 통과 수가 예상(124 → 128)과 다름 | 옮기는 중에 무언가 깨졌다 |
| `tsc`가 옮긴 블록 안을 가리킴 | 복사가 불완전하다 — 원본을 다시 읽는다 |
| Task 4 Step 6에서 `NoteDocument` 참조가 남음 | 배선이 덜 됐다 |
| `formatDuration` export 후 `notionSave.test.ts` 실패 | 함수를 건드렸다 — 시그니처만 바꿔야 한다 |
