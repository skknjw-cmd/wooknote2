# 화자 라벨링 기능 설계 스펙

- **작성일**: 2026-04-13
- **대상 프로젝트**: autonote (WOOK'S 회의록)
- **요청자**: 노진욱 이사
- **리뷰**:
  - Software Architect 에이전트: APPROVED WITH FIXES (11개 이슈 반영 완료)
  - UX Architect 에이전트: APPROVED WITH FIXES (5개 개선 + 디테일 반영 완료)

---

## 1. 배경 및 목표

### 문제
Clova Speech의 자동 화자 분리(diarization)는 실무에서 자주 틀린다. 동일 인물을 여러 화자로 쪼개거나, 서로 다른 인물을 하나의 화자로 합치기도 한다. 현재 `/api/stt` 라우트는 Clova 원본 segments를 `[화자 1] text` 문자열로 합쳐서 **원본 구조를 버리고** 있기 때문에, 후처리로 교정할 방법이 없다.

### 목표
1. 사용자가 식별된 화자(`[화자 1]`, `[화자 2]` 등)를 실제 참석자 이름에 수동으로 매칭할 수 있게 한다.
2. 매칭은 **사전(제출 전)** 과 **사후(결과 페이지)** 두 지점에서 모두 가능해야 한다.
3. Clova가 합쳐버린 화자를 교정할 수 있도록 **세그먼트 단위 개별 override**도 지원한다.
4. 매핑 결과는 PDF/Word/Notion 내보내기에 실제 이름으로 반영된다.

### 비목표 (YAGNI)
- VibeVoice 또는 다른 STT 엔진 지원 (별도 검토 끝에 드롭 결정)
- 자주 보는 참석자 이름 자동 학습(세션 간 제안)
- 음성 지문 기반 화자 자동 식별

---

## 2. 아키텍처 개요

### 핵심 원칙
**`/api/stt`는 더 이상 segments를 문자열로 합치지 않는다.** 구조화된 `Segment[]` 배열을 끝까지 끌고 다니며, 매핑은 해석(resolution) 단계에서 적용한다.

### 전체 플로우

```
[Clova Speech API]
    ↓ diarized segments
/api/stt route
    ↓ { segments: Segment[], text: string, sequenceId: number }
InputTabs (녹음 세그먼트 병합, 순서 보장)
    ↓ onChange({ type:"record", content, segments })
SpeakerMappingPanel (사전 매핑 UI)
    ↓ 사용자 매핑 설정 → page state
page.tsx handleSubmit
    ↓ resolveSegments(segments, mapping) → final text
/api/analyze (변경 없음)
    ↓ AnalysisResult
localStorage["last_meeting_result"] = SavedMeetingResult v2
    ↓
/result 페이지
    ├─ AnalysisSummary (기존)
    ├─ SpeakerMappingPanel (bulk 재매핑)
    ├─ SegmentOverrideList (per-segment 편집)
    └─ Actions: "표시 업데이트" (string-replace) | "재분석" (Gemini 재호출)
```

### 파일 변경 범위
| 파일 | 변경 유형 |
|---|---|
| `src/app/api/stt/route.ts` | 수정 — segments 반환 |
| `src/components/InputSection/InputTabs.tsx` | 수정 — segments state, 순서 보장 |
| `src/app/page.tsx` | 수정 — 매핑 적용, 저장 스키마 |
| `src/app/result/page.tsx` | 수정 — 사후 편집 UI 탑재, 마이그레이션 |
| `src/types/meeting.ts` | 신규 |
| `src/lib/speakerMapping.ts` | 신규 (순수 함수) |
| `src/lib/meetingStorage.ts` | 신규 (스키마 버저닝/마이그레이션) |
| `src/components/InputSection/SpeakerMappingPanel.tsx` | 신규 (bulk 매핑) |
| `src/components/ResultSection/SegmentOverrideList.tsx` | 신규 (per-segment) |
| `src/components/ResultSection/TranscriptEditor.tsx` | 신규 (위 둘 조합 + 액션) |

합계: **수정 4개, 신규 6개**. 기능이 단일 책임 단위로 쪼개져 개별 테스트 가능.

---

## 3. 데이터 모델

### `src/types/meeting.ts`

```ts
/**
 * 하나의 발화 단위. Clova 세그먼트 + 프론트 고유 ID로 구성.
 * originalSpeaker는 namespacing 되어 녹음 구간 경계를 넘어서도 안전하게 식별 가능.
 */
export type Segment = {
  id: string;                  // "seg_000001" 형태 단조증가 ID (localStorage 절약)
  sequenceId: number;          // 녹음 구간 순서 (2분 chunk 단위)
  originalSpeaker: string;     // "${sequenceId}:${clovaLabel}" 형태 — 예: "1:1", "2:1"
  text: string;
  start?: number;              // 전체 녹음 기준 누적 ms (cumulativeOffsetMs 적용 후)
  end?: number;
  speakerOverride?: string;    // 이 세그먼트 한정 override (우선순위 최상위)
};

/**
 * 화자 식별자 → 실제 이름 매핑.
 * key는 Segment.originalSpeaker와 동일 형태.
 * 빈 문자열/undefined는 "매핑 없음"으로 간주 (저장 시 해당 엔트리 제거).
 */
export type SpeakerMapping = Record<string, string>;

export type AnalysisResult = {
  title: string;
  date: string;
  attendees: string[];
  sections: Array<{
    name: string;
    type: "numbered" | "table";
    content: any[];
  }>;
};

/**
 * localStorage["last_meeting_result"]에 저장되는 전체 스냅샷.
 * schemaVersion 필드로 향후 마이그레이션 안전 보장.
 */
export type SavedMeetingResultV2 = {
  schemaVersion: 2;
  analysis: AnalysisResult;
  segments: Segment[];
  mapping: SpeakerMapping;
  meetingInfo: {
    title: string;
    date: string;
    location: string;
    attendees: string;
  };
  selectedOptions: string[];   // 재분석 시 필요
  generatedAt: string;         // ISO timestamp
  expiresAt: string;           // ISO timestamp (generatedAt + 30일 TTL)
};

// 하위 호환: 기존 저장 포맷 (segments 없음)
export type SavedMeetingResultV1 = AnalysisResult;
```

### `InputTabs`의 state 확장

```ts
type InputData = {
  type: "text" | "file" | "record";
  content: string | File | Blob | null;   // 기존 호환
  segments?: Segment[];                    // record 경로 전용
  mapping?: SpeakerMapping;                // 사전 매핑 결과
};
```

### 핵심 규칙 (Architect 피드백 반영)

1. **`originalSpeaker`는 namespaced.** Clova는 각 2분 구간을 독립 호출하므로 "1"이 구간마다 다른 사람일 수 있다. `"${sequenceId}:${clovaLabel}"` 형태로 전역 고유성 보장. `SpeakerMappingPanel`은 동일 실제 인물을 여러 namespace 키에 같은 이름으로 매핑하는 것을 허용 (구간 경계에서 화자 연결).
2. **`id`는 단조증가 카운터.** `crypto.randomUUID()`는 36자라 localStorage 낭비 → `seg_000001` 형태 6자리 카운터 사용.
3. **`start`/`end`는 전체 녹음 누적 시간.** 각 구간의 오프셋(`cumulativeOffsetMs`)을 더해 저장. 클라이언트가 구간 경과 시간을 추적.
4. **`speakerOverride`는 segment에 내장.** 별도 맵이 아닌 세그먼트 속성으로 두어 locality + serialize 단순화.
5. **`segments`는 record 탭 전용.** text/file 경로는 기존대로 `content` 사용, 매핑 UI 자동 숨김.

---

## 4. 컴포넌트 설계

### 4.1 `src/lib/speakerMapping.ts` (순수 함수)

```ts
/** 참석자 CSV 파싱 — trim, 빈값 제거, 중복 제거, 순서 유지 */
parseAttendees(csv: string): string[]

/** 고유 화자 통계 (namespaced key + 발화 횟수) */
getSpeakerStats(segments: Segment[]): Array<{
  label: string;      // originalSpeaker (namespaced)
  count: number;      // 발화 세그먼트 수
  displayLabel: string; // "[구간1·화자1]" 같은 사용자용 레이블
}>

/**
 * 세그먼트를 이름 붙인 최종 텍스트로 변환.
 * 우선순위: speakerOverride > mapping[originalSpeaker] > "화자 N"
 * 연속된 동일 화자 세그먼트는 하나의 블록으로 병합 (가독성).
 */
resolveSegments(segments: Segment[], mapping: SpeakerMapping): string

/**
 * 매핑 변경 시 AnalysisResult 내 모든 문자열 필드에서 이름을 치환.
 * 한국어 조사 경계 처리 + 긴 이름 우선 + 부분 충돌 방지.
 * - unresolvedCount: 치환 대상이지만 매칭 실패한 케이스 수
 * - unresolvedNames: 실패한 구(old name) 목록 (사용자 피드백용)
 * - 추가: analysis.attendees 배열도 새 매핑 값으로 머지
 */
applyMappingToAnalysis(
  analysis: AnalysisResult,
  oldMapping: SpeakerMapping,
  newMapping: SpeakerMapping
): {
  analysis: AnalysisResult;
  unresolvedCount: number;
  unresolvedNames: string[];
}
```

#### 한국어 조사 경계 처리 (Architect Must-Fix #3)

단순 `replaceAll`은 "김" → "김철수" 치환 시 "김치", "김포"를 오염시킨다. 단계적 완화책:

1. **이름 길이 우선 정렬**: 긴 이름부터 치환하여 짧은 이름이 긴 이름을 파괴하지 못하게 함.
2. **조사/경계 인식 정규식**: 다음 패턴에 인접할 때만 치환.
   ```
   (?<=^|[\s.,!?:;「『"'(\[])
   {escapedName}
   (?=$|[\s.,!?:;「』"')\]]|[은는이가을를과와의에서도로께으])
   ```
   앞: 문장 시작, 공백, 문장부호  
   뒤: 문장 끝, 공백, 문장부호, 조사(은/는/이/가/을/를/과/와/의/에/서/도/로/께/으)
3. **2글자 이하 이름 + 일반 명사 충돌 감지**: 이름이 일반 명사 리스트(간단한 stopword 세트 — "김치","김포","이사회","박사" 등 10~20개 일반어)와 겹치면 `unresolvedNames`에 추가하고 치환하지 않음 → 사용자에게 "재분석 권장" 토스트로 에스컬레이션.
4. **attendees 배열 머지**: `analysis.attendees = Array.from(new Set([...analysis.attendees, ...Object.values(newMapping).filter(Boolean)]))` — 단, 이전 이름은 제거해야 하므로 차집합 후 합집합.

→ 이게 완벽한 해결책은 아님을 솔직하게 인정. `unresolvedNames.length > 0`이면 UI에서 **"재분석"** 버튼을 강조 표시.

### 4.2 `src/lib/meetingStorage.ts` (신규, 스키마 버저닝)

```ts
/** 로드 시 스키마 버전 확인 + 마이그레이션 + TTL 만료 체크 */
loadMeetingResult(): SavedMeetingResultV2 | null

/** 저장 시 schemaVersion:2 강제 + expiresAt 자동 계산 (30일) */
saveMeetingResult(data: Omit<SavedMeetingResultV2, "schemaVersion" | "expiresAt">): void

/** v1 (순수 AnalysisResult) → v2 (segments=[], mapping={}) 마이그레이션 */
migrateV1ToV2(v1: SavedMeetingResultV1): SavedMeetingResultV2

/** 저장된 회의록 삭제 (설정 모달용) */
clearMeetingResult(): void
```

만료(`expiresAt < now`) 시 자동 삭제하고 `null` 반환. 결과 페이지는 "저장된 회의록이 없거나 만료되었습니다" 안내.

### 4.3 `SpeakerMappingPanel` (신규, bulk 매핑 UI)

**역할**: 고유 화자 리스트 + 이름 입력 드롭다운

**UX 원칙** (UX Architect 피드백 #1, #3 반영):
- **"구간" 개념은 UI에서 완전히 제거**한다. 사용자에게 Clova의 2분 청크는 구현 세부사항이며 관심 없다.
- 내부적으로는 `originalSpeaker`가 namespaced (`"1:1"`, `"2:1"`)로 저장되지만, 화면에는 **전역 단조 번호**(`화자 1`, `화자 2`, `화자 3`)로 표시한다.
- 사용자가 서로 다른 namespaced key에 같은 이름을 지정하면 자동으로 병합된 것처럼 보인다 (복잡성 은닉).
- 모든 표시 라벨은 "매핑" 대신 **"화자 이름 지정"** 사용 (비기술 사용자 친화).
- 두 사용처(사전/사후)에서 **동일한 라벨과 UI**로 제공하여 "같은 작업, 두 기회"라는 일관된 멘탈 모델 형성.

**Props**:
```ts
{
  segments: Segment[];
  mapping: SpeakerMapping;
  attendeesCsv: string;
  defaultCollapsed?: boolean;  // 기본 true (접힌 상태에서 카운트 뱃지만 보임)
  onChange: (mapping: SpeakerMapping, updatedAttendeesCsv?: string) => void;
  onAttendeeAdd?: (name: string) => void; // chip notification용
}
```

**UI (접힌 상태 — 기본)**:
```
▸ 화자 이름 지정 — 3명 감지됨
```

**UI (펼친 상태)**:
```
┌─ 화자 이름 지정 ─────────────────────────────┐
│ 💡 같은 사람이 여러 번 나타나면 같은 이름을       │
│   선택하세요 — 자동으로 합쳐집니다.              │
│   (첫 사용 시에만 표시되는 온보딩 배너)           │
│                                              │
│ 화자 1  ▼ 홍길동            발화 12회         │
│ 화자 2  ▼ 김영희            발화  8회         │
│ 화자 3  ▼ (선택...)                          │
│                                              │
│ ──────────────────────────────────           │
│ ▸ 구간 상세 보기 (선택)                        │
│   Clova가 녹음 구간마다 다시 화자를 추정합니다.  │
│   특정 구간 내에서만 이름을 다르게 지정하려면     │
│   펼쳐서 편집하세요.                           │
└──────────────────────────────────────────────┘
```

**"화자 N" 번호 매기기 로직**:
- namespaced key를 등장 순서대로 전역 단조 번호 할당: `{"1:1":"화자 1", "1:2":"화자 2", "2:1":"화자 3", ...}`
- 단, 사용자가 `"1:1"`과 `"2:1"`에 같은 이름("홍길동")을 매핑하면 UI상 **한 행으로 병합 표시**됨: `화자 1·3  ▼ 홍길동  발화 18회` (두 key의 합산 count)
- 행 클릭 시 "구간 상세 보기" 자동 펼침 → 어떤 namespaced key가 포함되었는지 투명하게 확인 가능

**온보딩 배너**:
- 첫 사용 시 `localStorage["wooks_onboarding_speaker"]==="done"` 체크
- 파란 info 배너로 1회 노출: *"Clova가 자동으로 화자를 구분하지만 가끔 틀립니다. 아래에서 실제 이름을 지정하세요."*
- 닫기 버튼으로 dismiss, dismissal 영구 저장

**사전 매핑(`page.tsx`)에 추가되는 보조 카피**:
```
(입력 섹션 하단)
나중에 결과 화면에서도 수정할 수 있습니다.
```
→ "지금 꼭 해야 하나?"라는 불안감 제거

**드롭다운**:
- 소스 = `parseAttendees(attendeesCsv)` + `"직접 입력..."`
- "직접 입력" 선택 시 inline `<input>` 노출
- **한국어 IME 처리 (중요)**: `isComposing` 체크 → 조합 중 Enter는 IME 확정용이므로 **무시**, 조합 끝난 후 Enter에만 submit
- Enter/blur로 확정 → `onAttendeeAdd(name)` 호출 → 상위 `MeetingInfoForm` 근처에 **chip notification** 표시: `+ 박민수 (새로 추가됨) [×]` — 사용자가 X 누르면 undo
  - 즉, 참석자 CSV에 조용히 append하지 말고 **명시적 피드백** 제공 (다크 패턴 방지)

**접근성**:
- `aria-label="화자 1의 실제 이름"` (namespace 노출 X)
- Tab으로 행 간 이동, Enter로 드롭다운 오픈, Esc로 닫기
- 최소 터치 타겟 44×44px (터치스크린 노트북 대응)

### 4.4 `SegmentOverrideList` (신규, 문장 단위 편집)

**역할**: 필요한 경우에만 사용하는 고급 교정 도구. Clova가 두 사람을 한 명으로 합쳐버린 경우 등.

**UX 원칙** (UX Architect 피드백 #4):
- **기본은 접힘.** 대부분의 사용자는 이 기능을 쓸 필요가 없음. 명시적 안내로 "언제 이걸 써야 하는지" 설명.
- **연속 동일 화자 세그먼트는 블록으로 묶어** 보여준다 (문장 단위가 아닌 발화 단위).
- **타임스탬프는 블록 단위**로 표시 (`00:12:34`), 문장마다 반복하지 않음.
- 긴 회의 대응: **100개 초과 시 가상 스크롤** + 화자 필터 드롭다운 ("특정 화자만 보기").

**Props**:
```ts
{
  segments: Segment[];
  mapping: SpeakerMapping;
  attendeesCsv: string;
  disabled?: boolean;  // 재분석 중 잠금
  onOverride: (segmentId: string, speakerName: string | undefined) => void;
}
```

**UI (접힌 상태 — 기본)**:
```
▸ 한 문장씩 직접 고치기 (고급)
  대부분의 경우 위에서 이름만 지정하면 충분합니다.
  Clova가 두 사람을 한 명으로 합친 경우에만 사용하세요.
```

**UI (펼친 상태)**:
```
┌─ 한 문장씩 직접 고치기 ────────────────────────┐
│ [특정 화자만 보기 ▼: 전체]                     │
│                                              │
│ 00:00:12  홍길동 ▼                           │
│   안녕하세요 오늘 회의를 시작하겠습니다.        │
│   지난주 리뷰부터 진행할까요?                  │
│   (연속 3문장이 하나의 블록)                   │
│                                              │
│ 00:00:45  김영희 ▼                           │
│   네 지난주 매출 현황부터 공유드리겠습니다.     │
│                                              │
│ 00:01:30  홍길동 ▼                           │
│   그 부분은 재고와 연결해서...                 │
└──────────────────────────────────────────────┘
```

- 블록 내 드롭다운 기본값 = `speakerOverride ?? mapping[originalSpeaker] ?? "화자 N"`
- override 해제 옵션("기본으로 복귀") 포함 → `undefined` 설정
- 필터 드롭다운: 화자별로 필터링하여 의심 화자의 발화만 스캔 가능
- 가상 스크롤: 블록 단위로 계산 (문장 단위 아님)
- 재분석 중 `disabled=true` → 전체 인터랙션 잠금, 시각적으로 반투명 처리

### 4.5 `TranscriptEditor` (신규, 결과 페이지 컨테이너)

**역할**: `SpeakerMappingPanel` + `SegmentOverrideList` 조합 + 액션 버튼

**UX 원칙** (UX Architect 피드백 #2, #5):
- **액션 버튼 라벨은 사용자 언어**로 작성. "표시 업데이트"/"재분석"은 개발자 용어.
- **Unresolved names는 inline callout**으로 상시 노출 (토스트 X — 스크롤 중 놓침).
- **재분석 로딩 상태**는 skeleton + 진행 카피 순환 + 취소 버튼 필수.
- **Undo 토스트** 10초 제공 — string-replace는 오염 가능성이 있어 즉시 되돌릴 수 있어야 함.

**Props**:
```ts
{
  savedResult: SavedMeetingResultV2;
  onAnalysisUpdate: (newAnalysis: AnalysisResult, newMapping: SpeakerMapping) => void;
  onReanalyzeRequest: (finalText: string, signal: AbortSignal) => Promise<void>;
}
```

**액션 라벨 (개편)**:
- **"이름만 바꾸기 (빠름)"** — 기존 "표시 업데이트"
- **"회의록 다시 만들기 (약 30초)"** — 기존 "재분석"

두 버튼을 segmented control 또는 primary/secondary 쌍으로 배치하고, 그 위에 한 줄 설명:
> *"이름만 바꾸면 즉시 반영됩니다. 요약 내용까지 다시 쓰려면 '다시 만들기'를 선택하세요."*

**`unresolvedNames.length > 0` 시**:
- "회의록 다시 만들기" 버튼 옆에 작은 배지 **"권장"** 자동 표시
- 액션 버튼 **위에** 눈에 띄는 inline callout:
  ```
  ┌─ ⚠️ 주의: 일부 이름이 자동 반영되지 않았습니다 ─┐
  │ 박이사, 김부장 — 회의록 본문에서 치환 실패.     │
  │ 정확히 반영하려면 '회의록 다시 만들기'를 사용하세요. │
  └────────────────────────────────────────────┘
  ```
- 토스트 X (지나가면 놓침)

**재분석 로딩 상태**:
- 전체 `TranscriptEditor` + `AnalysisSummary` 영역을 skeleton으로 치환
- 진행 카피 순환 (2초 간격):
  1. "회의 내용을 다시 정리하는 중…"
  2. "핵심 결정사항 추출 중…"
  3. "실행과제 정리 중…"
  4. "거의 완료되었습니다…"
- **취소 버튼** 제공 → `AbortController.abort()` 호출 → 기존 analysis 복구
- `aria-live="polite"`로 상태 변경 announce

**"이름만 바꾸기" undo 토스트**:
- 업데이트 성공 시 10초짜리 토스트: *"이름이 변경되었습니다. [되돌리기]"*
- [되돌리기] 클릭 → 이전 `analysis` + `mapping` 스냅샷으로 복구 (로컬 메모리에 직전 상태 1건만 유지)

**확인 다이얼로그 카피**:
- 재분석: *"회의록을 처음부터 다시 만듭니다. 약 30초가 소요됩니다. 실패하면 기존 결과는 그대로 유지됩니다. 진행할까요?"*
- 저장 삭제 (`SettingsModal`): *"이 회의록과 화자 이름 지정 내역이 삭제됩니다. 되돌릴 수 없습니다."*

**포커스 관리**:
- "이름만 바꾸기" 완료 후 포커스를 같은 버튼으로 반환 (유실 방지)
- 재분석 완료 후 새 `AnalysisSummary` 첫 섹션 제목으로 포커스 이동

### 4.6 `InputTabs` 수정 (순서 보장, Architect Must-Fix #1)

기존 `accumulatedTextRef` 제거, 대신:

```ts
const segmentsMapRef = useRef<Map<number, Segment[]>>(new Map());
const sequenceCounterRef = useRef(0);
const idCounterRef = useRef(0);
const cumulativeOffsetMsRef = useRef(0);

// 각 구간 시작 시 sequenceId 채번
const startSegment = (stream) => {
  const seqId = ++sequenceCounterRef.current;
  // ... MediaRecorder 생성
  // onstop에서 processSegment(blob, seqId) 호출
};

const processSegment = async (blob: Blob, seqId: number) => {
  // /api/stt 호출
  const data = await res.json();
  // 응답에 서버가 채번한 id는 무시하고 프론트에서 재부여
  const newSegments: Segment[] = data.segments.map((s, idx) => ({
    id: `seg_${String(++idCounterRef.current).padStart(6, "0")}`,
    sequenceId: seqId,
    originalSpeaker: `${seqId}:${s.clovaLabel}`,
    text: s.text,
    start: s.start !== undefined ? cumulativeOffsetMsRef.current + s.start : undefined,
    end: s.end !== undefined ? cumulativeOffsetMsRef.current + s.end : undefined,
  }));
  segmentsMapRef.current.set(seqId, newSegments);
  // sequenceId 순으로 flatten
  const allSegments = Array.from(segmentsMapRef.current.entries())
    .sort(([a], [b]) => a - b)
    .flatMap(([, segs]) => segs);
  onChangeRef.current({
    type: "record",
    content: resolveSegments(allSegments, {}),  // 매핑 없이 미리보기
    segments: allSegments,
  });
};

// 구간 완료 시 cumulativeOffsetMs에 실제 녹음 길이 누적
// (MediaRecorder의 정확한 duration 측정을 위해 startTime/endTime 기록)
```

핵심: out-of-order resolve에도 `sequenceId` 오름차순으로 정렬하여 최종 순서 보장.

### 4.7 `page.tsx` 수정

- `handleSubmit` 내부에서:
  ```ts
  if (inputData.type === "record" && inputData.segments) {
    const finalText = resolveSegments(inputData.segments, inputData.mapping ?? {});
    // /api/analyze 호출 후
    saveMeetingResult({
      analysis, segments: inputData.segments, mapping: inputData.mapping ?? {},
      meetingInfo, selectedOptions, generatedAt: new Date().toISOString()
    });
  }
  ```
- 기존 버그 동시 정리 (Architect 지적 #6): `setIsGenerating(true)` 중복 호출 제거, `await sttRes.ok ? ... : ...` 오타 수정, 중복 validation 제거.
- `SpeakerMappingPanel` 렌더: `inputData.type === "record" && (inputData.segments?.length ?? 0) > 0` 일 때만.

### 4.8 `/result/page.tsx` 수정

- `loadMeetingResult()` 사용 (마이그레이션 + TTL 자동 처리)
- `savedResult.segments.length > 0` 일 때만 `TranscriptEditor` 렌더
- `onAnalysisUpdate` 콜백으로 화면 분석 섹션 + localStorage 동시 갱신
- `onReanalyzeRequest`는 `/api/analyze` 재호출 → 에러 시 기존 analysis 유지 (롤백), 성공 시 새 analysis로 교체

### 4.9 `SettingsModal` 수정 (경미)

- 푸터에 **"저장된 회의록 삭제"** 버튼 추가 → `clearMeetingResult()` 호출
- 확인 다이얼로그 필수

---

## 5. 데이터 흐름 (상세)

### A. 녹음 → 사전 매핑 → 분석

1. `InputTabs`가 2분 구간마다 `/api/stt` 호출
2. `/api/stt`는 Clova 응답에서 `{ segments: [{clovaLabel, text, start, end}] }` 형태로 가공하여 반환. **프론트에서 최종 id/namespace를 부여**하므로 서버는 originalSpeaker의 namespacing 책임 없음.
3. `InputTabs`는 응답마다 `sequenceId`로 `Map`에 insert → 전체 flatten → `onChange`
4. 사용자가 `SpeakerMappingPanel`에서 매핑 설정 → `page.tsx`의 state 업데이트
5. "회의록 작성하기" → `resolveSegments(segments, mapping)` → `/api/analyze`
6. 분석 성공 시 `saveMeetingResult({analysis, segments, mapping, meetingInfo, selectedOptions, generatedAt})`
7. `router.push("/result")`

### B. 결과 페이지 사후 편집 — string-replace

1. `/result` 진입 → `loadMeetingResult()` (v1이면 마이그레이션)
2. 사용자가 `SpeakerMappingPanel` 또는 `SegmentOverrideList` 수정 → local editState
3. "표시 업데이트" 클릭
4. `applyMappingToAnalysis(analysis, oldMapping, newMapping)` 호출
5. 결과 저장 + state 갱신 + `unresolvedCount > 0` 이면 토스트 경고("{unresolvedNames.join(',')}는 자동 치환 실패. 재분석 권장")

### C. 결과 페이지 사후 편집 — 재분석

1. "재분석" 클릭 → 확인 다이얼로그
2. `isReanalyzing=true` → 편집 UI 잠금 (`SpeakerMappingPanel`/`SegmentOverrideList` disabled)
3. `finalText = resolveSegments(segments, newMapping)` → `/api/analyze` 재호출
4. 성공 시 `analysis` 교체, localStorage 갱신, `isReanalyzing=false`
5. 실패 시 alert + 롤백 (기존 analysis 유지)

---

## 6. 에러 처리 & 엣지 케이스

| 상황 | 처리 |
|---|---|
| Clova 응답에 segments 없음 | fallback: `[{id, sequenceId, originalSpeaker:`${seq}:1`, text:data.text}]` 단일 세그먼트 |
| 세그먼트 변환 실패 (구간) | 에러 세그먼트 삽입, originalSpeaker="?:?", 매핑 UI에서 드롭다운 비활성 |
| out-of-order STT 응답 | `segmentsMapRef`의 sequenceId 정렬로 해결 |
| 구간 경계에서 같은 라벨=다른 인물 | namespacing으로 방지, 사용자에게 경고 UI 노출 |
| 녹음 중간 새 화자 등장 | 다음 세그먼트부터 새 namespaced key 자동 추가 |
| 매핑 없이 제출 | 허용 — `resolveSegments`가 "화자 N"으로 fallback |
| 두 화자 → 같은 이름 | 의도된 기능 (Clova 합체 오류 복구) |
| 빈 문자열 매핑 | 저장 시 엔트리 제거 (매핑 없는 상태) |
| 참석자 명단에 없는 이름 | "직접 입력"으로 추가, 자동으로 `meetingInfo.attendees` CSV에도 append |
| Gemini 이름 paraphrase | `applyMappingToAnalysis`가 `unresolvedNames`에 추가 → 재분석 권장 |
| 이름이 일반 명사와 충돌 | stopword 체크 → 치환 skip → `unresolvedNames`에 추가 |
| 재분석 중 사용자 편집 | `isReanalyzing` 플래그로 편집 UI 잠금 |
| 재분석 중 Gemini 실패 | alert + 기존 analysis 유지 (롤백) |
| 구 버전 localStorage (v1) | `migrateV1ToV2` 자동 실행, `segments=[]`로 로드 → TranscriptEditor 자동 숨김 |
| TTL 만료 | `loadMeetingResult`가 `null` 반환 → "저장된 회의록이 없습니다" |
| 텍스트/파일 경로 | segments 미존재 → 매핑 UI 전체 숨김 |
| Notion export 참석자 | `analysis.attendees`가 매핑 값으로 머지되어 있으므로 자동 반영 |
| localStorage 용량 초과 | segments 수백~수천 개 가능 → id 6자리 카운터 + start/end 정수 ms로 최소화. 초과 시 `QuotaExceededError` 캐치 → 사용자에게 "저장 공간 부족, 이전 회의록 삭제 필요" 안내 |

---

## 7. 접근성 (WCAG 참고)

- 모든 드롭다운/버튼에 `aria-label` (한국어, namespace 노출 X — 예: `aria-label="화자 1의 실제 이름"`)
- Tab 키로 화자 행 간 이동, Enter로 드롭다운 오픈, Esc로 닫기
- `aria-live="polite"` 리전으로 상태 변경 announce:
  - "이름만 바꾸기" 완료 → "이름이 변경되었습니다"
  - 재분석 시작 → "회의록을 다시 만들고 있습니다"
  - 재분석 완료 → "회의록이 새로 생성되었습니다"
- **포커스 관리**:
  - "이름만 바꾸기" 완료 후 포커스를 같은 버튼으로 반환 (유실 방지)
  - 재분석 완료 후 새 `AnalysisSummary` 첫 섹션 제목으로 이동
- **한국어 IME**: `"직접 입력"` 인풋은 `isComposing` 체크 — 조합 중 Enter는 IME 확정이므로 무시, 조합 끝난 뒤 Enter에만 submit
- 포커스 트랩 없음 — 모달이 아닌 inline 컴포넌트
- **색상 의존 정보 금지** — 경고는 ⚠️ 아이콘 + 텍스트 prefix "주의:" 병기
- **최소 터치 타겟 44×44px** — 터치스크린 노트북 대응 (드롭다운, 버튼, 블록 행)
- 확인 다이얼로그는 `role="alertdialog"` + `aria-describedby`로 본문 연결

---

## 8. 프라이버시 & 보안

- `last_meeting_result`에 **30일 TTL** 자동 적용 (Architect 지적)
- `SettingsModal`에 **"저장된 회의록 삭제"** 버튼 추가
- API 키는 기존대로 `wooks_settings`에만, 변경 없음
- 회의 원문은 기존에도 localStorage 저장 — 이번 변경으로 volume 증가하지만 저장 위치는 동일 (클라이언트 로컬)
- ADR 노트: 현재는 single-user local-only. 멀티유저 요구 시 재설계 필요.

---

## 9. 테스트 전략

### 9.1 Unit (Vitest — 신규 도입)

**`src/lib/speakerMapping.ts`**:
- `parseAttendees`: 정상 CSV, 공백/빈값/중복, 빈 문자열
- `resolveSegments`:
  - 우선순위 (override > mapping > fallback)
  - 연속 동일 화자 블록 병합
  - 매핑 부분 적용
- `applyMappingToAnalysis`:
  - 단순 치환
  - 긴 이름 우선 (홍길동 vs 홍길)
  - 조사 경계 ("홍길동이 말했다" → "김철수가 말했다"는 조사 불변 OK, 단 이름만 치환)
  - 일반 명사 충돌 감지 (이름="김" + "김치" 문장 → 스킵)
  - `unresolvedNames` 정확성
  - `analysis.attendees` 머지
- `getSpeakerStats`:
  - 빈 배열 → `[]`
  - 중복 count
  - displayLabel 포맷

**`src/lib/meetingStorage.ts`**:
- v1 로드 → v2 마이그레이션
- TTL 만료 시 null 반환 + 자동 삭제
- 정상 v2 로드

### 9.2 Integration

**`/api/stt/route.ts`**:
- Clova 정상 응답 fixture → 구조화 segments 반환
- Clova `segments` 없는 fixture → fallback 단일 세그먼트
- Clova `result:"FAILED"` 응답 → 422 반환

### 9.3 수동 QA 시나리오

1. 녹음 3분(2구간) + 2명 화자 + 사전 매핑 + 제출 → 분석에 실명 반영 확인
2. 녹음 3분 + 매핑 없이 제출 → "화자 1/2" 그대로 확인
3. 결과 페이지에서 매핑 수정 → "표시 업데이트" → 분석 섹션 즉시 반영
4. 결과 페이지에서 매핑 수정 → "재분석" → 새 분석 결과 확인
5. 세그먼트 override로 Clova 오분리 교정 → 반영 확인
6. 텍스트 입력 경로 → 매핑 UI 미노출 확인
7. 에러 세그먼트 포함 녹음 → 매핑 패널에 "?" 비활성 처리
8. 구간 경계 화자 namespacing 검증 (구간1·화자1과 구간2·화자1 분리 유지)
9. 녹음 후 out-of-order 응답 시뮬레이션(느린 네트워크) → 최종 순서 정상
10. v1 저장 로드 → 마이그레이션 후 에디터 숨김
11. PDF/Word/Notion 내보내기에서 실제 이름 반영 확인
12. `SettingsModal`의 "저장된 회의록 삭제" → 결과 페이지 접근 불가 확인

---

## 10. 리뷰 대응 체크리스트

### 10.1 Software Architect 리뷰

| # | 이슈 | 심각도 | 반영 위치 |
|---|---|---|---|
| 1 | STT 세그먼트 순서 보장 | 높음 | §4.6 segmentsMapRef + sequenceId 정렬 |
| 2 | originalSpeaker namespacing | 높음 | §3 데이터 모델 + §4.3 경고 배지 |
| 3 | 한국어 조사 경계 치환 | 중간 | §4.1 applyMappingToAnalysis 정규식 + stopword |
| 4 | 재분석 race condition | 중간 | §4.5 isReanalyzing 플래그 + 편집 잠금 |
| 5 | localStorage 스키마 마이그레이션 | 중간 | §3 schemaVersion + §4.2 meetingStorage.ts |
| 6 | page.tsx 기존 버그 정리 | 경미 | §4.7 |
| 7 | 컴포넌트 분리 (Panel + List) | 설계 | §4.3, §4.4 두 컴포넌트 분리 |
| 8 | Export 호환성 (attendees 머지) | 높음 | §4.1 applyMappingToAnalysis가 attendees 배열도 업데이트 |
| 9 | 접근성 (aria/Tab) | 중간 | §7 |
| 10 | 프라이버시 TTL + 삭제 버튼 | 중간 | §8, §4.2, §4.9 |
| 11 | 테스트 out-of-order/namespace 시나리오 | 테스트 | §9.3 시나리오 8, 9 |

### 10.2 UX Architect 리뷰

| # | 이슈 | 반영 위치 |
|---|---|---|
| 1 | "구간N·화자N" 노출 제거, 전역 "화자 N" 번호 사용, 같은 이름 자동 병합 표시 | §4.3 UX 원칙 + 번호 매기기 로직 |
| 2 | 액션 버튼 개명: "이름만 바꾸기 (빠름)" / "회의록 다시 만들기 (약 30초)" + 설명 카피 | §4.5 액션 라벨 |
| 3 | 사전/사후 동일 라벨("화자 이름 지정"), 접힌 기본 상태, "나중에 수정 가능" 카피 | §4.3 UI + 보조 카피 |
| 4 | `SegmentOverrideList` 기본 접힘, 블록 그룹핑, 타임스탬프 블록 단위, 가상 스크롤, 화자 필터 | §4.4 전면 개편 |
| 5 | 재분석 로딩 skeleton + 진행 카피 순환 + 취소 버튼, unresolved inline callout (토스트 X), undo 토스트, 풍부한 확인 다이얼로그 카피, 첫 사용 온보딩 배너 | §4.3, §4.5 |
| 6 | 한국어 IME `isComposing` 처리 | §4.3, §7 |
| 7 | 참석자 자동 추가 chip notification (조용한 mutation 금지) | §4.3 |
| 8 | 접근성 보강 (aria-live, 포커스 관리, 텍스트 prefix, 44px 터치 타겟) | §7 |

---

## 11. 오픈 이슈 / 향후 고려

- **일반 명사 stopword 리스트**: 초기 10~20개로 시작, 사용자 피드백 기반 확장. 별도 JSON 파일 또는 코드 내 상수.
- **긴 회의 UX**: 세그먼트 수 > 100 시 `SegmentOverrideList` 가상 스크롤 도입 여부 → 1차 릴리스에서는 기본 접힘만 제공, 추후 측정 후 결정.
- **다국어**: 현재 한국어 고정. 향후 영어 회의 지원 시 stopword/정규식 재설계 필요.

---

**승인자**: 노진욱 이사 (확인 대기)  
**Software Architect 리뷰**: APPROVED WITH FIXES (모든 Must-Fix 반영 완료)  
**UX Architect 리뷰**: APPROVED WITH FIXES (5개 개선 + 디테일 반영 완료)
