# UI/UX 재편 설계 — 트랜스크립트를 주인공으로

**날짜:** 2026-09-16
**상태:** 설계 승인 대기

## 배경

세 번의 변경(PR #1 · #4 · #5)으로 앱의 동작이 바뀌었다.

1. 회의가 끝나도 **AI 분석을 하지 않는다.** Notion에 바로 저장한다
2. 이어 녹음은 **기존 Notion 페이지에 덧붙인다**
3. 정리는 Notion에서 Claude가 한다

**화면은 그대로다.** 메인 패널은 여전히 AI 분석 문서이고, 분석을 안 하므로 이렇게 보인다.

```
핵심 요약      → "녹음 중 자동으로 요약됩니다..."   ← 일어나지 않는 일을 약속한다
결정사항       → "결정사항이 없습니다."
미결정사항     → "미결정사항이 없습니다."
자유 메모      → (빈칸)
```

정작 실제 결과물인 트랜스크립트는 380px 사이드 패널에 있고, 실질적 목적지인 Notion은
`review` 모드에서만 뜨는 배너 한 줄이다.

## 정해진 것

사용자 결정 두 가지가 이 설계의 전제다.

| 질문 | 답 |
|---|---|
| 메인 화면은 무엇인가 | **트랜스크립트** |
| `[다시 정리]`(AI 분석)를 쓰는가 | **거의 안 쓴다** — Notion에서 Claude로 한다 |

## 진행 방식 — 3단계

한 PR에 몰지 않는다. 단계마다 실제로 써 보고 넘어간다.

| 단계 | 내용 | 화면 변화 |
|---|---|---|
| **1** | 도달 불가 코드와 죽은 UI 정리 | 죽은 버튼과 가짜 빵부스러기가 사라진다. 그 외에는 없음 |
| **2** | 레이아웃 재편 | 큼 |
| **3** | 컴포넌트 라이브러리 추출 → CLAUDE DESIGN 연동 | 없음 |

1단계가 먼저인 이유: 지금은 살아있는 컴포넌트와 죽은 컴포넌트가 섞여 있어 3단계에서
**무엇을 라이브러리로 올릴지 고를 수가 없다.**

---

## 1단계 — 죽은 코드 정리

### 도달 불가 판정 근거

`/result` 라우트로 가는 네비게이션이 코드 어디에도 없다(`router.push("/result")` 0건).
`SettingsModal`과 `LiveWithPrompt`는 아무도 import 하지 않는다.

현재 살아있는 트리는 `src/app/page.tsx` 하나에서 뻗는다.

```
page.tsx
├ AppShell ─ NoteList · LiveTranscript(RecordingBar · SpeakerBubble)
│            NoteDocument · ModelLoadingOverlay
├ ModeSelect · PreMeetingRoster
├ TextInputPanel · AudioFilePanel · VideoPanel
├ ExportModal
└ ApiKeyModal ─ NotionConnectionPanel
```

### 삭제 대상 (4,223줄)

| 묶음 | 파일 |
|---|---|
| `/result` 라우트 | `src/app/result/page.tsx`(467) · `page.module.css`(61) |
| ResultSection | `SummaryBoard`(125) · `TranscriptEditor`(243) · `ExportTools`(57) · `SegmentOverrideList`(201) + CSS 4개(393) |
| InputSection | `InputTabs`(544) · `ComparisonPanel`(46) · `SpeakerMappingPanel`(324) + CSS 3개(402) |
| ConfigSection | `AnalysisOptions`(49) · `MeetingInfoForm`(77) + CSS 2개(105) |
| 기타 컴포넌트 | `Settings/SettingsModal`(86) + CSS(114) · `Speaker/LiveWithPrompt`(62) |
| lib | `meetingStorage.ts`(104) · `meetingStorage.test.ts`(92) · `wikiSave.ts`(61) |
| lib (별도 판단) | `speakerMerge.ts`(224) · `speakerMerge.test.ts`(386) |

`speakerMerge`는 `InputSection/InputTabs`만 쓰므로 함께 고아가 된다. 다만 **통과하는
테스트 386줄**이 딸려 있어 성격이 다르므로, 계획에서 커밋을 나눠 이것만 거부할 수
있게 한다.

`SpeakerMappingPanel`은 `ResultSection/TranscriptEditor`만 쓰고, 그 둘 다 `/result`에서만
쓰인다. 살아있는 `src/lib/speakerMapping.ts`와는 다른 파일이므로 **그것은 남긴다**
(`page.tsx`·`notionSave.ts`가 쓴다).

### 깨진 테스트에 대해 — 고치는 게 아니라 지우는 것

`meetingStorage.test.ts > round-trips a v2 save/load`는 지금 `main`에서 실패한다.
이 단계 뒤 테스트 스위트가 전부 통과하게 되지만, **결함을 고쳐서가 아니라 모듈을
지워서다.** 커밋 메시지와 PR에 그렇게 적는다.

`meetingStorage`는 localStorage 키 `last_meeting_result` 하나를 쓴다. 이 키에 남아 있는
데이터는 **마이그레이션하지 않고 방치한다** — IndexedDB의 `NoteRecord`가 이미 정본이고,
이 키를 읽던 유일한 화면(`/result`)이 함께 사라지기 때문이다. 그래서 브라우저에 찌꺼기
한 줄이 남는다. 방치한다는 사실을 PR에 적는다.

### 패키지

`/result/page.tsx`가 사라지면 `jspdf`와 `html2canvas`가 아무 데서도 안 쓰인다.
`package.json`에서 뺀다.

`docx`는 **남긴다** — `exportNote.ts:217`이 동적 import로 쓴다.
`file-saver`도 `exportNote.ts`가 쓴다.

### 죽은 UI 고치기

| 위치 | 지금 | 조치 |
|---|---|---|
| `AppShell.tsx:162` 제목 입력칸 | `defaultValue`만, `onChange` 없음 → 타이핑이 버려짐 | 2단계에서 **유일한 제목 입력구**가 되므로, 여기서는 일단 `onUpdateNote`에 연결 |
| `AppShell.tsx:195` `[복사]` | `onClick` 없음 | 제거 |
| `AppShell.tsx:207` `[더 보기]` | `onClick` 없음 | 제거 |
| `AppShell.tsx:156` 빵부스러기 `전체 노트 / 오늘` | 하드코딩 | 제거(2단계 헤더에서 다시 설계) |
| `NoteDocument.tsx:492` `"녹음 중 자동으로 요약됩니다..."` | 일어나지 않는 일 | 문구 제거 |
| `page.tsx`의 `analyzing` | **두 가지를 겸한다** — `analyzeFromTurns`(진짜 AI)와 `handleTextSubmit`(Notion 저장) | 개명이 아니라 **둘로 분리** |

계획을 쓰며 확인한 결과, `analyzing`은 **한쪽에서는 진짜 AI 분석이 맞다**(`page.tsx:602`).
그래서 통째로 개명하면 거짓이 된다. `handleTextSubmit`(`:709`)만 새 상태
`savingToNotion`으로 떼어낸다.

**이것은 화면에 거짓이 뜨는 문제가 아니다.** 텍스트 제출 중에는 `TextInputPanel`
("저장 중...")만 보이고 `AppShell`("AI 분석 중...")은 렌더되지 않는다. 코드를 읽는
사람이 속는 문제이고, 2단계에서 prop을 옮길 때 잘못 옮기기 쉬운 자리다.

---

## 2단계 — 레이아웃 재편

```
┌──────────────────────────────────────────────────────────────┐
│ ☰  [2026-09-16 팀 주간회의             ]   ● Notion 동기화됨    │
├────────┬─────────────────────────────────────┬───────────────┤
│ 노트    │                                     │ 회의 정보      │
│ 목록    │  [화자 1] 0:03                       │  일시 09-16    │
│        │  안녕하세요 오늘은 3분기...            │  장소 —       │
│ ▸ 오늘  │                                     │  참석자 3명    │
│  · 주간 │  [화자 2] 0:11                       │  소요 12:04   │
│  · 기획 │  네 시작하겠습니다.                    │               │
│        │                                     │ ───────────── │
│ ▸ 어제  │  [화자 1] 0:24                       │ 자유 메모      │
│        │  먼저 지난주 액션부터...               │  ...          │
│        │                                     │ ───────────── │
│        │                                     │ Notion         │
│        │                                     │  회의록 DB ↗   │
│        │                                     │  발화 42 동기화 │
│        │                                     │  [다시 정리]    │
├────────┴─────────────────────────────────────┴───────────────┤
│  ● REC  12:04    [이어 녹음] [Notion 갱신] [내보내기] [저장]     │
└──────────────────────────────────────────────────────────────┘
```

### 무엇이 어디로

| 지금 | 다음 | 왜 |
|---|---|---|
| 트랜스크립트 380px 사이드 | **메인**, 남는 폭 전부 | 실제 결과물이다 |
| 분석 문서(요약·결정·미결정·액션) 메인 | **제거** | 분석을 안 한다. Notion에서 Claude가 한다 |
| 회의일시·장소·참석자 (`NoteDocument`의 속성 행) | 오른쪽 **회의 정보 패널** | Notion으로 실제 나가는 값들이다 |
| 자유 메모 | 회의 정보 패널 | 유일하게 사용자가 직접 쓰던 블록 |
| Notion 상태 = `review` 배너 | **상시 표시**(헤더 칩 + 패널 섹션) | 실질적 목적지다. 저장 뒤에만 보이면 늦다 |
| 제목 입력구 2개(헤더는 죽음) | **헤더 하나** | 눈에 띄는 쪽이 죽어 있는 것이 지금 문제다 |
| `[다시 정리]` 헤더 | 정보 패널 하단 | 거의 안 쓴다 |

`장소`는 남긴다. 속성으로 나가지는 않지만 트랜스크립트 맨 위 `회의 정보` 줄에
실린다(`notionBlocks.ts:65`).

### 새 컴포넌트 경계

`NoteDocument`(804줄)를 지우고 그 자리에 둘을 만든다.

| 컴포넌트 | 책임 | 의존 |
|---|---|---|
| `MeetingInfoPanel` | 일시·장소·참석자·소요시간 표시와 편집, 자유 메모 | `NoteRecord`, `onUpdateNote` |
| `NotionStatusPanel` | 동기화 상태, 페이지 링크, `[Notion 갱신]`, 건너뛴 속성 | `NotionSaveState`, `onRetryNotion` |

`AppShell`의 인라인 스타일(패널 폭·핸들·배너)을 CSS Module로 옮긴다. 3단계에서
라이브러리로 뽑으려면 스타일이 컴포넌트에 붙어 있어야 한다.

### 분석 경로를 지우지는 않는다

`[다시 정리]`는 남긴다. "거의 안 쓴다"는 "절대 안 쓴다"가 아니다.
`AnalysisResult` 타입과 `/api/analyze`, `onRegen` 경로는 **그대로 두고**, 분석 결과를
보여줄 화면만 새로 정한다 — 기본 화면이 아니라 눌렀을 때 열리는 뷰.

이 뷰의 모양은 2단계 구현 시점에 정한다. 지금 정하면 쓰지도 않을 화면을 미리 설계하게 된다.

---

## 3단계 — CLAUDE DESIGN 연동

### 지금 막혀 있다

이 세션에서 `claude-design` MCP 서버가 붙지 않았다.

```
claude-design (FIRST_PARTY_AUTH_REJECTED):
api.anthropic.com rejected your claude.ai login (HTTP 401). Run /login and retry.
```

사용자가 `/login`을 다시 해야 한다.

### 용도를 정확히

`DesignSync` 도구는 **로컬 컴포넌트 라이브러리를 claude.ai/design의 디자인 시스템
프로젝트와 동기화**한다. 앱 UI를 새로 그려주는 도구가 아니다. `/design-sync` 스킬을
사용자가 직접 시작해야 동작한다.

### 올릴 것

`globals.css`에 토큰은 이미 있다(`--ink-1~5`, `--sp1~4`, `--r-sm/md/lg`, `--rec`).
없는 것은 **컴포넌트 단위의 경계**다. 1·2단계가 끝나면 이 정도가 후보다.

- Type / Colors / Spacing (토큰 프리뷰)
- Buttons (`.btn` · `.btn-primary` · `.icon-btn`)
- SpeakerBubble (화자색 4종)
- NoteList row
- StatusBanner / StatusChip
- Panel (정보 패널 · Notion 패널의 공통 껍데기)

---

## 검증

**이 저장소에는 UI 테스트가 없다.** 단위 테스트는 순수 함수(`notionBlocks`,
`turnAssembly`, `speakerMapping`, `notionSave`)만 덮는다. 렌더링·상호작용을 검증하는
테스트는 0개다.

그래서 단계마다 이렇게 확인한다.

| 단계 | 검증 |
|---|---|
| 1 | `tsc --noEmit` · `npm run build` · `npm test`. 삭제만 하므로 **빌드가 통과하면 도달 불가 판정이 맞았다는 뜻** |
| 2 | 브라우저에서 직접: 녹음 → 중지 → 이어 녹음 → 저장. 제목 입력이 실제로 저장되는지. 좁은 창에서 3열이 무너지지 않는지 |
| 3 | Design System 패널에서 카드가 뜨는지 |

2단계에는 자동 검증이 없다. 그 사실을 PR에 적는다.

## 하지 않는 것

- 다크 모드 — 토큰에 없고, 요청에 없다
- 모바일 레이아웃 — 3열이 전제다. 필요하면 별도 작업
- `/api/analyze`와 `AnalysisResult` 타입 삭제 — `[다시 정리]`가 남는다
- IndexedDB 스키마 변경 — `NoteRecord`는 그대로
- PR #3에서 넘어온 Notion 검증 항목(`dataSourceId` 문자열 동일성 등) — 별개 작업

## 위험과 미정

| 항목 | 내용 |
|---|---|
| **삭제가 과할 수 있음** | 도달 불가 판정은 `grep` 기반이다. 문자열로 동적 참조하는 곳이 있으면 못 잡는다. 빌드와 수동 확인으로만 거른다 |
| **`NoteDocument` 제거가 되돌리기 어려움** | 804줄과 그 CSS가 사라진다. git에는 남지만 되살리려면 2단계 전체를 되돌려야 한다 |
| **분석 뷰 미설계** | 2단계 구현 시점으로 미룬다. 그때 다시 결정이 필요하다 |
| **CLAUDE DESIGN 로그인** | 사용자만 풀 수 있다. 3단계 전체가 여기 걸려 있다 |
