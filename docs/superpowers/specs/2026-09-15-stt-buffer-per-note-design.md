# 녹음 발화 버퍼 노트별 분리 설계 스펙

- **작성일**: 2026-09-15
- **대상 프로젝트**: autonote (WOOK'S 회의록)
- **요청자**: 노진욱
- **상태**: 사용자 검토 대기
- **선행 작업**: `2026-09-15-notion-direct-save-design.md` (병합 완료, PR #1)

---

## 1. 배경 및 목표

### 문제

`useOfflineSTT`가 트랜스크립트를 **페이지 세션 전역**으로 소유한다. `startRecording`은 `speakerLetterMapRef`·타이머·`elapsedMs`를 초기화하지만 `turns` / `turnsRef` / `prevContextRef`는 **초기화하지 않는다**(`useOfflineSTT.ts:263-295`).

그 결과, 페이지를 새로고침하지 않고 두 번째 회의를 녹음하면 회의록에 이전 회의가 통째로 붙는다.

```
회의 A 녹음 → 중지 → 저장            turnsRef = [A의 발화 300개]
"새 노트" → 라이브 → 녹음 시작        turnsRef 그대로 유지   ← 초기화 없음
회의 B 5분 녹음 → 중지
  → finalizeNote(segments: A 300개 + B 40개)
  → IndexedDB · 로컬 .md · Notion에 그대로 저장
```

이것은 사이드바 클릭 같은 특수 경로가 아니라 **정상 플로우**다. 선행 작업에서 "녹음 중 다른 노트를 클릭하면"이라고 좁게 기록한 것은 부정확했다.

선행 작업이 이 버그를 만든 것은 아니다. 다만 예전에는 저장 버튼을 눌러야 기록됐던 것이 이제 자동으로 IndexedDB·로컬 파일·Notion까지 올라가므로 **노출 빈도와 파급이 커졌다.** 선행 작업의 Ruling 13은 이어 녹음을 차단해 가장 파괴적인 경로만 임시로 막아둔 상태다.

### 같은 뿌리에서 나온 다른 증상

트랜스크립트와 참석자의 **출처가 훅과 노트 두 곳**이라서 생기는 문제들이다.

| 증상 | 위치 |
|------|------|
| 사이드바에서 연 노트를 내보내면 세션 버퍼가 나간다 | `page.tsx:605` — `handleExport`가 `stt.turns` 사용 |
| 사이드바에서 연 노트의 발화는 편집해도 저장되지 않는다 | `onEditTurn`/`onSplitTurn`이 훅 버퍼를 수정 |
| 옛 노트에도 현재 세션 참석자가 표시된다 | `page.tsx:670` — `participants={stt.participants}` |
| 옛 노트에서 화자 이름을 고쳐도 저장되지 않는다 | `updateSpeakerName`이 훅 state만 수정 (`useOfflineSTT.ts:329`) |
| 표시할 발화를 삼항식으로 고른다 | `page.tsx:668` — 출처가 둘이라는 증상 그 자체 |

### 목표

1. 연속 녹음 시 이전 회의가 섞이지 않는다.
2. 녹음 중 다른 노트를 봐도 녹음은 원래 노트에 계속 쌓인다.
3. 이어 녹음이 안전하게 동작한다(Ruling 13의 차단 해제).
4. 트랜스크립트와 참석자의 출처를 `NoteRecord` 하나로 통일한다.
5. 발화 조립 로직에 단위 테스트를 붙인다. 현재 0개다.

### 비목표 (YAGNI)

- **동시 다중 녹음** — 한 번에 하나만 녹음한다.
- **음성 지문 기반 화자 식별** — 세션 간 화자 동일성 판정은 하지 않는다(§4 참조).
- **`TurnSegment` 스키마 변경 / 기존 노트 마이그레이션** — 불필요하도록 설계한다(§3 참조).
- **STT 정확도·프롬프트 개선** — 별개 과제.
- **Clova 요금 추정 오계산, surrogate pair 분할** — 후속 과제 2·3번. 이 스펙과 독립이며 각각 별도로 처리한다.

---

## 2. 아키텍처 개요

### 핵심 원칙

**훅은 오디오를, 페이지는 발화를 소유한다.**

현재 훅은 마이크 제어 + STT 호출 + **발화 조립**(같은 화자 이어붙이기, id 부여, 시각 포맷)까지 한다(`useOfflineSTT.ts:153-186`). 발화 조립이 훅 안에 있는 한 훅은 트랜스크립트를 소유하게 되고, 그 소유가 곧 이 버그다. 따라서 **훅에서 상태를 걷어낸다.**

| 컴포넌트 | 책임 |
|----------|------|
| `useOfflineSTT` | 마이크, MediaRecorder, 15초 청크, 워치독, Wake Lock, STT API 호출. 청크가 끝나면 **가공되지 않은 조각**을 내보낸다 |
| `src/lib/turnAssembly.ts` (신규) | 순수 함수. 조각 → `TurnSegment[]` 조립 |
| `page.tsx` | 조립 결과를 `recordingNoteId` 노트의 `segments`에 반영. 편집·분할·화자 이름도 노트에 직접 |

### 변경 후 데이터 흐름

```
마이크 → MediaRecorder → 15초 청크 → /api/stt-*
    ↓ { clovaLabel, text }[]
useOfflineSTT: onChunk({ segments, chunkStartMs })   ← 콜백으로 내보냄. 훅은 보관하지 않음
    ↓
page.tsx: assembleTurns(노트의 기존 segments, 조각, { baseMs, chunkStartMs, letterMap })
    ↓
notes[recordingNoteId].segments 갱신  ← 유일한 진실의 원천
    ↓
화면(LiveTranscript · NoteDocument) / IndexedDB / 로컬 .md / Notion 모두 이 배열을 본다
```

### 훅 인터페이스 변경

```ts
// 제거
turns: TurnSegment[];
getLatestTurns: () => TurnSegment[];
editTurn: (id, newText) => void;
splitTurn: (id, beforeText, afterText) => void;
participants: Participant[];
setParticipants: (p) => void;
updateSpeakerName: (sp, name) => void;

// 추가
recordingNoteId: string | null;
startRecording: (noteId: string, onChunk: ChunkHandler) => Promise<void>;

// 유지
modelStatus, modelProgress, isRecording, elapsedMs, sttError, stopRecording
```

```ts
export type RawSegment = { clovaLabel: string; text: string };
export type ChunkHandler = (chunk: { segments: RawSegment[]; chunkStartMs: number }) => void;
```

`onChunk`는 `startRecording` 인자로 받아 ref에 보관한다. 의존성 배열 문제와 stale closure를 피하기 위해서다.

### 파일 변경 범위

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/lib/turnAssembly.ts` | 신규 | `assembleTurns`, `nextSpeakerBase` (순수 함수) |
| `src/lib/turnAssembly.test.ts` | 신규 | 단위 테스트 |
| `src/hooks/useOfflineSTT.ts` | 수정 | 발화·참석자 상태 제거, `onChunk` 콜백, `recordingNoteId` |
| `src/app/page.tsx` | 수정 | 조립·편집·분할·화자 이름을 노트에 직접 |
| `src/components/Layout/AppShell.tsx` | 수정 | 다른 노트 녹음 중 표시, 이어 녹음 차단 해제 |

`LiveTranscript.tsx`, `NoteDocument.tsx`는 이미 props로 `turns`/`participants`를 받으므로 **변경하지 않는다.** 넘기는 값만 바뀐다.

---

## 3. 타임스탬프 오프셋

`TurnSegment.t`는 문자열 `"MM:SS"`이며 **녹음 시작 기준**이다. 이어 녹음 2차 세션이 다시 `00:00`부터 시작하면 1차 발화와 시각이 겹친다.

녹음 시작 시점의 `note.audioDuration`(ms)을 기준점으로 잡고 `formatTime(baseMs + chunkStartMs)`로 계산한다.

- `TurnSegment` 스키마를 바꾸지 않는다 → 기존 노트 마이그레이션 불필요
- 새 녹음은 `baseMs = 0`이므로 기존 동작과 동일
- 녹음 종료 시 `audioDuration = baseMs + elapsedMs`로 누적한다

`audioDuration`은 선행 작업에서 ms로 단위를 통일했다.

---

## 4. 화자 번호: 이어받지 않고 새로 단다

이어 녹음 2차 세션의 화자는 **기존 최대 `sp` + 1**부터 부여한다. 기존에 화자 1·2가 있으면 3·4부터 시작한다.

### 근거

STT가 주는 화자 레이블은 세션마다 독립적이다. OpenAI는 `"A"`, `"B"` 같은 문자를 세션 안에서만 일관되게 주고, Gemini는 숫자를 주지만 세션 간 동일성을 보장하지 않는다. 따라서 **2차의 "화자 1"이 1차의 "화자 1"과 같은 사람이라는 근거가 없다.**

번호를 이어받으면 두 사람을 조용히 한 사람으로 합치게 된다. 회의록에서 발언을 엉뚱한 사람에게 귀속시키는 것은 눈에 띄지 않는 데다 피해가 크다. 번호를 새로 달면 화자 목록이 늘어나지만, 사용자가 같은 이름을 붙이면 출력에서 자연히 합쳐진다 — `speakerMapping`과 `updateSpeakerName`이 이미 그 일을 한다.

**틀릴 수 있는 추측 대신 눈에 보이는 정리 작업**을 택한다.

### 문자 레이블 맵

`speakerLetterMapRef`(`"A"` → `1`)는 훅에서 `page.tsx`로 옮긴다. 녹음 세션 단위로 유지되며 `startRecording` 때 초기화하고, 시작 번호는 `nextSpeakerBase(note.segments)`로 정한다.

---

## 5. 녹음 중 보기 전환

`recordingNoteId !== currentNote.id`인 상태를 **정상 상태로 취급**한다. 회의 도중 지난 회의록을 찾아보는 것은 실제로 흔한 일이다.

- 상단바 `live-pill`을 확장한다. 다른 노트를 보고 있으면 **`● 다른 노트 녹음 중 · 돌아가기`** 로 표시하고, 클릭하면 `recordingNoteId` 노트로 이동한다.
- 녹음 중에 또 다른 녹음을 시작하려 하면 막고 같은 안내를 띄운다. 동시 녹음은 지원하지 않는다.
- `handleOpenNote`는 녹음을 중지시키지 않는다. `currentNote`만 바꾼다.
- 녹음 중지 시 `finalizeNote`의 대상은 **`currentNote`가 아니라 `recordingNoteId` 노트**다. 사용자가 다른 노트를 보고 있어도 올바른 노트가 저장된다.

### 선행 작업의 임시 차단 해제

Ruling 13이 도입한 `liveNoteId` 가드와 이어 녹음 버튼 숨김을 제거한다. 이어 녹음이 이제 안전하기 때문이다. `handleToggleRecording`의 "빈 버퍼로 기존 segments를 덮어쓰지 않는다" 가드도 불필요해진다 — 조립이 항상 기존 `segments` 위에 붙기 때문이다.

---

## 6. 발화 조립 (순수 함수)

```ts
// src/lib/turnAssembly.ts

export type RawSegment = { clovaLabel: string; text: string };

export type AssembleOptions = {
  baseMs: number;                    // 이어 녹음 오프셋
  chunkStartMs: number;              // 이번 청크의 녹음 내 시작 시각
  letterMap: Map<string, number>;    // "A" → sp. 호출자가 소유하며 변형된다
  speakerBase: number;               // 이 세션이 쓸 첫 화자 번호
  nextId: number;                    // 다음 TurnSegment.id
};

/** 조각을 기존 발화 뒤에 조립한다. prev를 변형하지 않고 새 배열을 반환한다. */
export function assembleTurns(
  prev: TurnSegment[],
  segments: RawSegment[],
  opts: AssembleOptions,
): { turns: TurnSegment[]; nextId: number };

/** 기존 발화에서 다음에 쓸 화자 번호를 구한다. 비어 있으면 1. */
export function nextSpeakerBase(prev: TurnSegment[]): number;
```

### 조립 규칙 (현재 훅 동작을 그대로 옮긴다)

1. `text`가 공백뿐인 조각은 버린다.
2. 레이블을 `sp`로 변환한다. **두 경로 모두 `speakerBase`를 반영해야 한다** — 반영하지 않으면 §4가 깨진다(아래 주의 참조).
   - 숫자로 파싱되면(Gemini): `sp = parsed + (speakerBase - 1)`. 0이면 1로 본다. 새 녹음은 `speakerBase = 1`이므로 `sp = parsed`로 기존 동작과 완전히 같다.
   - 문자면(OpenAI `"A"`, `"B"`): `letterMap`으로 변환하고, 없으면 `speakerBase + letterMap.size`를 새로 할당한다.
3. 직전 발화와 `sp`가 같으면 그 발화의 `text`에 `" "`로 이어붙인다. 다르면 새 발화를 만든다.
4. 새 발화의 `t`는 `formatTime(baseMs + chunkStartMs)`.
5. `id`는 `nextId`부터 증가시킨다.

**단, 이어 녹음의 첫 청크는 3번 규칙을 적용하지 않는다.** 이전 세션의 마지막 발화에 이어붙이면 서로 다른 세션의 발언이 한 덩어리가 된다.

> **주의 — 숫자 레이블에 `speakerBase`를 반영하지 않으면 §4가 조용히 깨진다.**
> 현재 훅은 숫자 레이블을 그대로 `sp`로 쓴다(`useOfflineSTT.ts:158-161`). 이 경로를 그대로 옮기면, Gemini를 쓰는 이어 녹음에서 2차 세션이 다시 `1`, `2`를 반환하는 순간 1차 세션의 화자 1·2와 **번호가 충돌해 서로 다른 사람이 합쳐진다.** §4가 막으려던 바로 그 상황이 문자 레이블에서만 막히고 숫자 레이블에서는 뚫린다.
> 그래서 2번 규칙이 두 경로 모두에 `speakerBase`를 적용한다. 단위 테스트에 이 케이스를 반드시 넣는다.

---

## 7. 편집·분할·화자 이름

훅에서 제거하고 `page.tsx`가 `currentNote`를 직접 수정한 뒤 `saveNote`로 저장한다.

| 동작 | 변경 후 |
|------|---------|
| `onEditTurn(id, text)` | `currentNote.segments`에서 해당 발화의 `text` 교체 |
| `onSplitTurn(id, before, after)` | 해당 발화를 둘로 나누고 뒤쪽에 새 `id` 부여 |
| `onSpeakerName(sp, name)` | `currentNote.participants` 갱신 |

경로가 하나뿐이므로 **녹음 중이든 사이드바에서 연 옛 노트든 동일하게 동작하고 저장된다.**

`AppShell`에 넘기는 값도 단순해진다.

```tsx
turns={currentNote?.segments ?? []}
participants={currentNote?.participants ?? []}
```

`page.tsx:668`의 `entryMethod === "live" ? stt.turns : currentNote.segments` 삼항식과 `page.tsx:605`의 `const turns = stt.turns`가 사라진다.

### `stt.turns`를 읽던 나머지 두 곳

| 위치 | 현재 | 변경 후 |
|------|------|---------|
| `page.tsx:227-236` | `stt.turns.length` 증가분으로 `pendingTurnCount`(새 발화 배지) 계산 | 녹음 중인 노트의 `segments.length` 증가분으로 계산 |
| `page.tsx:442` | `handleRegen`이 `note.segments`가 비면 `stt.turns`로 폴백 | 폴백 제거. `note.segments`가 유일한 출처이므로 불필요 |

### 로스터 전달 경로

`handleStart(roster)`는 현재 `stt.setParticipants(roster)`와 노트 양쪽에 참석자를 넣는다(`page.tsx:328`). 훅 쪽이 사라지므로 **로스터는 노트의 `participants`에만** 들어간다.

### 녹음 중 편집과의 충돌

녹음 중 사용자가 발화를 편집하는 사이 새 청크가 도착할 수 있다. 조립은 항상 **그 시점의 노트 `segments`를 읽어** 뒤에 붙이므로, 앞쪽 발화에 대한 편집은 보존된다. 조립 시 `setNotes`의 함수형 업데이트를 사용해 stale state를 피한다.

---

## 8. 테스트

### 단위 테스트 (`src/lib/turnAssembly.test.ts`, vitest)

| 대상 | 케이스 |
|------|--------|
| `nextSpeakerBase` | 빈 배열 → 1 / `sp` 1,2 → 3 / `sp` 5만 → 6 |
| `assembleTurns` | 같은 화자 이어붙이기 / 다른 화자 새 발화 / 공백뿐인 조각 무시 / 빈 조각 배열 → `prev` 그대로 / `baseMs` 오프셋 반영 / 문자 레이블 `"A"`,`"B"` 매핑 / 같은 문자 재등장 시 같은 `sp` / `id` 연속 증가 / `prev` 불변 |
| `assembleTurns` — `speakerBase` (§6 주의) | `speakerBase = 1`이면 숫자 레이블 `"1"` → `sp` 1 (기존 동작 보존) / **`speakerBase = 3`이면 숫자 레이블 `"1"` → `sp` 3, `"2"` → `sp` 4** / `speakerBase = 3`이면 문자 `"A"` → `sp` 3 / 이어 녹음 첫 청크는 직전 발화와 `sp`가 같아도 병합하지 않는다 |

### 수동 검증 (자동 테스트가 닿지 않는 영역)

마이크·MediaRecorder·워치독·Wake Lock은 단위 테스트로 덮을 수 없다. 이 작업의 실질적 위험은 여기에 있다.

1. **연속 2회 녹음** — 새로고침 없이 회의 A 녹음·저장 후 새 노트로 회의 B 녹음. B에 A의 발화가 없어야 한다. (이 스펙의 핵심 검증)
2. **이어 녹음** — 저장된 노트에서 이어 녹음. 시각이 이어지고, 새 화자 번호가 기존 최대값 다음부터 붙는다.
3. **녹음 중 보기 전환** — 녹음 중 사이드바에서 옛 노트를 연다. 상단에 `● 다른 노트 녹음 중` 표시. 돌아가면 발화가 계속 쌓여 있다.
4. **녹음 중 전환 후 중지** — 다른 노트를 보는 상태에서 중지. 녹음하던 노트가 저장되고, 보고 있던 노트는 그대로다.
5. **15분 이상 녹음** — 워치독이 여전히 녹음기를 되살리는지.
6. **옛 노트 편집** — 사이드바에서 연 노트의 발화를 고치고 화자 이름을 바꾼 뒤 다시 열어 유지되는지.
7. **옛 노트 내보내기** — 사이드바에서 연 노트를 PDF로 내보내 그 노트의 트랜스크립트가 나오는지.

---

## 9. 후속 과제 (이 스펙 범위 밖)

- **Clova 요금 추정** — `audioDuration`이 채워지면서 live·Gemini 녹음까지 Clova 단가로 계산된다. `NoteRecord`에 STT 제공자 정보가 없는 것이 원인.
- **surrogate pair 분할** — `splitText`가 UTF-16 코드 단위로 잘라 2000자 경계의 이모지를 깨뜨린다.
- `/api/analyze`의 섹션명 문자열 매칭 파싱을 스키마 기반으로 교체.
- `applyAnalysis()`의 디버깅 `console.log` 정리.
- `meetingStorage.test.ts`의 기존 실패 테스트(`main`에서도 실패).
