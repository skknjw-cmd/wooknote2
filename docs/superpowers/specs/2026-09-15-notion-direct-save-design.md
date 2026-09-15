# 분석 없는 Notion 직접 저장 설계 스펙

- **작성일**: 2026-09-15
- **대상 프로젝트**: autonote (WOOK'S 회의록)
- **요청자**: 노진욱
- **상태**: 사용자 검토 대기

---

## 1. 배경 및 목표

### 문제

회의 입력(live 녹음 / 텍스트 / 오디오 파일)이 끝나면 앱이 **자동으로** Gemini 분석(`/api/analyze`)을 호출한다. 이 구조에 두 가지 비용이 붙는다.

1. **금전 비용** — 회의 1건마다 Gemini 호출이 무조건 1회 발생한다. 사용자가 결과를 쓰든 안 쓰든 과금된다.
2. **실패율** — `/api/analyze`는 모델 3개 체인(`gemini-2.5-flash` → `2.5-flash-lite` → `2.0-flash`)에 모델당 2회까지 재시도하는 구조이고, 그 결과 JSON을 `applyAnalysis()`가 **섹션 이름 문자열 부분일치**("핵심요약", "To-Do", "미결정사항" 등)로 파싱한다. 모델이 섹션명을 조금만 다르게 반환하면 해당 필드가 조용히 비어버린다. 디버깅용 `console.log`가 `applyAnalysis` 한 함수에만 6곳 남아 있는 것이 이 불안정성의 흔적이다.

사용자는 이미 Claude 구독을 보유하고 있고, Claude는 Notion MCP로 Notion 페이지를 직접 읽고 수정할 수 있다. **분석을 앱에서 하지 않고 Claude에게 넘기면** 위 두 비용이 모두 사라진다.

### 목표

1. 회의 입력이 끝나면 AI 분석 없이 **트랜스크립트 원문을 곧바로 Notion에 저장**한다.
2. Notion 데이터베이스의 `상태` 속성으로 "아직 분석 안 된 회의록"을 Claude가 식별할 수 있게 한다.
3. Gemini 분석은 삭제하지 않고 **수동 버튼으로만** 남긴다. 사용자가 원할 때만 비용이 발생한다.
4. Notion 저장이 실패해도 **회의 내용은 절대 유실되지 않는다**.

### 비목표 (YAGNI)

- **역방향 동기화** — Claude가 Notion에서 분석·수정한 결과를 앱으로 되가져오지 않는다. 저장 이후 Notion이 원본이고, 앱의 IndexedDB 노트는 트랜스크립트 보관용이다.
- **설정의 "자동 분석 ON/OFF" 토글** — 수동 "다시 정리" 버튼이 이미 같은 역할을 한다.
- **앱이 Notion 데이터베이스를 자동 생성** — 사용자가 미리 만든 DB를 가리키게만 한다.
- **Notion 페이지 URL을 앱에 보관** — 사용자가 명시적으로 제외했다.
- **`/api/analyze` 자체의 파싱 안정성 개선** — 자동 호출이 사라지면 노출 빈도가 급감한다. 별도 과제.

---

## 2. 아키텍처 개요

### 핵심 원칙

**저장은 로컬 먼저, Notion은 그다음.** IndexedDB 저장이 성공한 뒤에 Notion을 시도한다. 네트워크·토큰·스키마 어느 단계에서 실패하든 회의 내용은 이미 로컬에 있다.

**화자 이름 해석은 클라이언트에서 끝낸다.** 서버 라우트는 `NoteRecord`나 `speakerMapping`의 존재를 모른다. 클라이언트가 이미 해석된 평평한 페이로드를 보낸다.

### 변경 후 전체 플로우

```
[live 녹음 중지] / [텍스트 제출] / [오디오 변환 완료]
    ↓  (callAnalyze 호출 제거)
NoteRecord 조립 (title, meetingDate, participants, segments, audioDuration)
    ↓
finalizeNote()
    ├─ 1) dbSave(note)              IndexedDB — 항상 먼저
    ├─ 2) saveNoteToFolder(note)    로컬 폴더 .md — 기존 동작 그대로
    └─ 3) pushToNotion(note)        신규
            ↓
        POST /api/notion
        headers: x-notion-token, x-notion-db
            ↓
        databases.retrieve(dbId)        ← 스키마 조회
            ↓ filterProperties()         ← 실재하는 속성만 채움
        pages.create({ properties, children: blocks[0..99] })
            ↓
        blocks.children.append × N       ← 100개씩 순차
            ↓
        { ok, pageId, totalBlocks, skippedProperties }
            ↓
    review-banner 상태 갱신 (저장 중 / 완료 / 실패+재시도 / Notion 미설정)

[다시 정리] 버튼  ──→  /api/analyze  (사용자가 누를 때만)
```

### 파일 변경 범위

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `src/app/api/notion/route.ts` | 신규 | Notion 페이지 생성 + 블록 배치 append |
| `src/lib/notionBlocks.ts` | 신규 | 페이로드 → 블록 변환, 분할, 속성 필터링 (순수 함수) |
| `src/lib/notionBlocks.test.ts` | 신규 | 위 순수 함수 단위 테스트 |
| `src/lib/apiKey.ts` | 수정 | Notion 토큰/DB ID getter·setter, `notionKeyHeaders()` |
| `src/components/Layout/ApiKeyModal.tsx` | 수정 | Notion 토큰 / DB ID 입력란, `audioDuration` 단위 버그 수정 |
| `src/components/Layout/AppShell.tsx` | 수정 | `review-banner`를 저장 상태 기반으로 전환 |
| `src/app/page.tsx` | 수정 | 3개 경로에서 자동 분석 제거, `finalizeNote()` 도입 |
| `src/lib/audioChunk.ts` | 수정 | `chunkAudioFile()`이 실제 오디오 길이를 함께 반환 (7.2 참조) |
| `src/types/meeting.ts` | 수정 | `NotionMeetingPayload`, `NotionSaveState` 타입 추가 |

**유지(삭제하지 않음)**: `/api/analyze` 라우트, `applyAnalysis()`, `callAnalyze()`, `handleRegen()`, Gemini 토큰 과금 집계. 전부 수동 "다시 정리" 버튼이 계속 사용한다.

---

## 3. 데이터 계약

### 3.1 클라이언트 → 서버 페이로드

`NoteRecord`를 그대로 보내지 않는다. `audioBlob`(Blob)이 들어 있어 JSON 직렬화가 불가능하고, 서버가 알 필요도 없다.

```ts
// src/types/meeting.ts
export type NotionMeetingPayload = {
  title: string;
  meetingDate: string;      // "2026-09-15" (Notion date 속성용 ISO date)
  location?: string;
  attendees: string[];      // 해석된 실명
  durationText: string;     // "1:23:45" — 빈 문자열 가능
  entryMethod: EntryMethod; // "live" | "text" | "audio" | "video"
  turns: Array<{
    speaker: string;        // 이미 해석된 표시 이름 ("김팀장" 또는 "화자 2")
    time: string;           // "00:12" — 빈 문자열 가능
    text: string;
  }>;
};
```

**화자 이름 해석 우선순위** (클라이언트에서 적용):
`note.speakerMapping[sp]` → `note.participants.find(p => p.sp === sp)?.name` → `"화자 {sp}"`

### 3.2 서버 → 클라이언트 응답

```ts
type NotionSaveResponse =
  | { ok: true;  pageId: string; totalBlocks: number; skippedProperties: string[] }
  | { ok: false; stage: "append"; pageId: string; savedBlocks: number; totalBlocks: number; error: string }
  | { ok: false; stage: "auth" | "schema" | "create"; error: string };
```

- **HTTP 200 + `ok: true`** — 전체 저장 성공
- **HTTP 200 + `ok: false, stage: "append"`** — 페이지는 만들어졌으나 블록 일부만 저장됨(부분 성공). 페이지가 실제로 존재하므로 2xx로 돌려주고 클라이언트가 부분 상태를 표시한다.
- **HTTP 4xx/5xx + `{ error, stage }`** — 하드 실패. `stage`는 `"auth" | "schema" | "create"`.

### 3.3 저장 상태

```ts
export type NotionSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "partial"; savedBlocks: number; totalBlocks: number }
  | { kind: "unconfigured" }
  | { kind: "failed"; message: string };
```

---

## 4. Notion 데이터베이스 스키마

사용자가 Notion에서 미리 만들어 두고, 통합(integration)을 해당 DB에 초대해야 한다.

| 속성 이름 | 타입 | 값 | 필수 |
|-----------|------|-----|------|
| 이름 | title | 회의 제목 | ✅ (Notion DB는 title 속성이 항상 존재) |
| 회의일시 | date | `meetingDate` | 선택 |
| 참석자 | rich_text | 쉼표로 이은 실명 | 선택 |
| 소요시간 | rich_text | `"1:23:45"` | 선택 |
| 상태 | select | `"분석대기"` | 선택 |
| 입력방식 | select | `"live"` / `"text"` / `"audio"` | 선택 |

### 스키마 방어

Notion API는 **DB에 존재하지 않는 속성 이름을 보내면 400**을 던진다. 사용자가 속성 이름을 다르게 지었을 때 저장 전체가 실패하면 안 되므로:

1. 저장 직전 `databases.retrieve(dbId)`로 실제 스키마를 읽는다.
2. `filterProperties(schema, values)`가 **이름과 타입이 모두 일치하는 속성만** 남긴다.
3. 걸러진 속성 이름을 `skippedProperties`로 반환해 배너에 "회의일시·상태 속성이 없어 건너뜀"으로 알린다.

title 속성은 이름이 무엇이든(기본값 "이름", 영문 DB면 "Name") **타입이 `title`인 속성을 찾아** 제목을 넣는다. 이름에 의존하지 않는다.

`select` 속성의 옵션(`분석대기` 등)이 DB에 미리 정의돼 있지 않아도 Notion API가 자동으로 옵션을 생성하므로 별도 처리는 하지 않는다.

---

## 5. 페이지 본문 구조

```
## 회의 정보
일시: 2026-09-15 · 장소: 3층 회의실 · 참석자: 김팀장, 이책임, 박선임 · 소요시간: 1:23:45

## 트랜스크립트
[김팀장] 00:12  지난주 진행사항부터 확인하겠습니다.
[이책임] 00:31  네, 저는 API 연동 쪽을 …
```

`## 트랜스크립트` 헤딩을 두는 이유: Claude가 분석 결과(요약·결정사항·액션)를 **그 헤딩 앞에 삽입**할 자리를 명확히 갖게 하기 위함이다.

### 블록 생성 규칙

- `heading_2` — "회의 정보", "트랜스크립트"
- `paragraph` — 회의 정보 1줄, 발화 1개당 1블록
- 발화 블록의 rich_text 구성: `[화자명]`(bold) + `" 00:12  "` + 본문

### Notion API 제약 대응

| 제약 | 대응 |
|------|------|
| rich_text 1개당 2000자 | `splitText(text, 2000)`으로 쪼개 **여러 문단 블록**으로 만든다. 첫 블록에만 화자·시각 접두를 붙이고 이어지는 블록은 본문만 담는다. |
| 요청 1건당 자식 블록 100개 | `chunkBlocks(blocks, 100)`으로 나눈다. 첫 덩어리는 `pages.create`의 `children`으로, 나머지는 `blocks.children.append`로 순차 전송. |
| 요청 본문 크기 | 100블록 × 2000자 ≈ 200KB로 Notion 한도(약 500KB) 안. 별도 처리 불필요. |

1시간 회의(발화 300~600개) 기준 요청 횟수는 `retrieve` 1 + `create` 1 + `append` 3~6회.

---

## 6. 에러 처리

| 상황 | 동작 | 배너 |
|------|------|------|
| 토큰 또는 DB ID 미설정 | `/api/notion` 호출 자체를 하지 않음. 로컬 저장은 정상 수행 | `unconfigured` — "로컬에 저장됨 · Notion 미설정" + [설정] 버튼 |
| 401 / 403 | 하드 실패, `stage: "auth"` | "Notion 토큰이 유효하지 않거나 통합이 DB에 초대되지 않았습니다" |
| 404 (DB 없음) | 하드 실패, `stage: "schema"` | "데이터베이스 ID를 확인하세요" |
| 429 / 5xx | 라우트 내부에서 **1.5초 후 1회 재시도**, 그래도 실패면 하드 실패 | "Notion 저장 실패 · 로컬에는 저장됨" + [다시 시도] |
| `append` 중 실패 | 페이지 유지, `ok: false, stage: "append"` | "일부만 저장됨 (200/450 블록)" + [다시 시도] |
| IndexedDB 저장 실패 | Notion 시도하지 않고 즉시 알림 | 기존 `console.error` 경로 유지 |

**재시도 동작**: `[다시 시도]`는 처음부터 다시 페이지를 만든다. 부분 저장된 페이지가 Notion에 남지만, 중복 페이지를 이어붙이기보다 사용자가 잘못된 쪽을 지우는 편이 단순하고 안전하다. 배너에 "이전 시도로 만들어진 페이지가 남아 있을 수 있습니다"를 함께 표시한다.

---

## 7. 기존 코드의 부수 정리

이 작업이 직접 건드리는 범위 안에서만 정리한다. 무관한 리팩터링은 하지 않는다.

### 7.1 저장 유실 구멍

현재 `handleToggleRecording`은 녹음 중지 후 `updateNoteState()`만 호출한다(`page.tsx:334-338`). 즉 사용자가 **저장 버튼을 누르지 않고 창을 닫으면 회의가 사라진다.** `finalizeNote()` 도입으로 중지 즉시 IndexedDB에 들어가면서 이 구멍이 함께 닫힌다.

### 7.2 `audioDuration`이 항상 0

`NoteRecord.audioDuration`은 `emptyNote()`에서 0으로 초기화된 뒤 **어디에서도 갱신되지 않는다.** 그런데 `NoteList`, `ModeSelect`, `ApiKeyModal`(Clova 요금 추정) 세 곳이 이 값을 읽는다. Notion `소요시간` 속성도 이 값을 쓰므로 함께 고친다.

- 단위를 **밀리초(ms)로 확정**한다. 소비처 3곳 중 2곳(`NoteList`, `ModeSelect`의 `formatDuration`)이 이미 ms로 다루고, live 녹음의 `elapsedMs`와도 단위가 같다.
- `ApiKeyModal`은 이 값을 초로 가정하고 `totalAudioDurationSec / 60 * 4`로 Clova 요금을 계산한다(`ApiKeyModal.tsx:120-124`). ms 기준으로 나누도록 고친다. 지금까지 값이 항상 0이라 드러나지 않던 잠재 버그다.
- live 종료 시 `stt.elapsedMs`를 `audioDuration`에 넣는다.
- 오디오 파일 모드는 실제 길이를 쓴다. `chunkAudioFile()`이 이미 `decodeAudioData()`로 파일을 디코딩하므로(`audioChunk.ts:32`), 반환 타입을 `Blob[]`에서 `{ chunks: Blob[]; durationMs: number }`로 넓힌다. 호출처는 `page.tsx`의 `handleAudioSubmit` 안 2곳(Clova 분기 / Gemini·OpenAI 분기)뿐이다. 청크 수 × 120초로 추정하면 마지막 청크 때문에 항상 과대 계산되므로 쓰지 않는다.
- 텍스트 입력 모드는 오디오가 없으므로 `audioDuration = 0`, `durationText = ""`이며 Notion `소요시간` 속성을 채우지 않는다.

### 7.3 live 노트 제목

live 모드의 기본 제목은 `"새 노트"`다. 지금까지는 분석이 `result.title`로 덮어썼지만, 분석을 끄면 Notion에 `"새 노트"`가 그대로 올라간다. 제목이 비어 있거나 `"새 노트"`이면 **`"YYYY-MM-DD HH:mm 회의"`로 자동 생성**한다.

---

## 8. UI 변경

`AppShell`의 `review-banner`(현재 "녹음이 종료되었습니다. 저장하려면 저장 버튼을 눌러주세요.")를 저장 상태 기반으로 바꾼다. 새 배너 컴포넌트를 만들지 않고 기존 자리를 재사용한다.

| 상태 | 문구 | 버튼 |
|------|------|------|
| `saving` | "저장 중… Notion에 기록하고 있습니다." | — |
| `saved` | "저장 완료 · Notion에 기록됨" | 이어 녹음 / 내보내기 / 다시 정리 |
| `partial` | "일부만 저장됨 (200/450)" | 다시 시도 / 내보내기 |
| `unconfigured` | "로컬에 저장됨 · Notion 미설정" | 설정 / 내보내기 |
| `failed` | "Notion 저장 실패 · 로컬에는 저장됨" | 다시 시도 / 내보내기 |

`AppShell`에 추가되는 props: `notionStatus?: NotionSaveState`, `onRetryNotion?: () => void`.

기존 `저장` 버튼은 남긴다. 회의 후 화자명이나 메모를 고친 뒤 로컬에 다시 저장하는 용도로 여전히 필요하다. 단 이 버튼은 **Notion을 다시 건드리지 않는다** — Claude가 이미 편집했을 수 있는 페이지를 덮어쓰지 않기 위해서다.

---

## 9. 설정 UI

`ApiKeyModal`에 Notion 섹션을 추가한다. 기존 Gemini/OpenAI/Clova 입력과 같은 패턴이다.

- **Internal Integration Token** → `localStorage["autonote_notion_token"]`
- **Database ID** (32자 hex) → `localStorage["autonote_notion_db"]`
- DB ID 입력란은 붙여넣은 Notion URL에서 32자 hex를 자동 추출한다.
- 필요한 속성 이름 안내 문구와, 통합을 DB에 초대해야 한다는 안내를 함께 표시한다.

---

## 10. 테스트 계획

### 단위 테스트 (`src/lib/notionBlocks.test.ts`, vitest)

| 대상 | 케이스 |
|------|--------|
| `splitText` | 2000자 미만 → 1개 / 정확히 2000자 → 1개 / 2001자 → 2개 / 빈 문자열 → 0개 |
| `buildBlocks` | 빈 `turns` → 헤딩만 / 발화 1개 → 헤딩 2 + 정보 1 + 발화 1 / 2000자 초과 발화 → 연속 문단 분할 및 접두 위치 |
| `chunkBlocks` | 99개 → 1덩어리 / 100개 → 1덩어리 / 101개 → 2덩어리(100+1) / 250개 → 3덩어리 |
| `filterProperties` | 전 속성 존재 → 그대로 / `상태` 없음 → 제외 + `skipped`에 포함 / 타입 불일치(`회의일시`가 rich_text) → 제외 / title 속성을 이름이 아닌 타입으로 탐색 |

### 수동 검증

1. Notion DB를 만들고 통합 초대 → 설정에 토큰·DB ID 입력
2. 2분 live 녹음 → 중지 → 배너가 `saving` → `saved`로 바뀌고 Notion에 페이지 생성 확인
3. 토큰을 틀리게 입력 → `failed` 배너 + 로컬에는 저장돼 있는지 확인
4. `상태` 속성을 지운 DB로 저장 → 저장은 성공하고 "건너뜀" 안내가 뜨는지 확인
5. 30분 이상 녹음(블록 100개 초과) → 트랜스크립트가 잘리지 않고 전부 올라가는지 확인
6. `다시 정리` 버튼 → Gemini 분석이 여전히 동작하는지 확인

---

## 11. 후속 작업 (이번 범위 밖)

- Claude 쪽 워크플로 정리: `상태 = 분석대기`인 페이지를 찾아 요약·결정사항·액션을 페이지에 삽입하고 `상태`를 `분석완료`로 바꾸는 절차. 앱 코드가 아니라 Claude 프롬프트/스킬의 영역.
- `/api/analyze`의 섹션명 문자열 매칭 파싱을 스키마 기반으로 교체.
- `applyAnalysis()`의 디버깅 `console.log` 6곳 정리.
