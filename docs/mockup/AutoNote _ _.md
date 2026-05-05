# AutoNote — 개발 핸드오프 문서

> **버전** v1.0 · 2026.05.05
> **디자인 산출물** `AutoNote UI 개선안 (standalone).html`
> **대상** 프론트엔드 / 백엔드 / ML 개발자

이 문서는 디자인 의도를 정확히 옮기기 위한 사양서입니다. 시각 디테일은 standalone HTML을 직접 클릭해 확인해주세요. 텍스트보다 빠릅니다.

---

## 0. 한 줄 요약

> **노트가 1차 시민, 트랜스크립트는 보조.** AI는 8개 노트 블록 중 하나로 공존하며, 사용자가 직접 쓴 메모를 절대 덮어쓰지 않는다.

---

## 1. 설계 원칙 (Why)

| # | 원칙 | 영향받는 결정 |
|---|---|---|
| P1 | **노트 영역이 가장 크다** | 트랜스크립트 380px 고정, 노트 영역 가변(메인) |
| P2 | **AI는 메모를 대체하지 않는다** | AI 정리 블록과 자유 메모 블록을 분리 |
| P3 | **라이브 중엔 사용자 통제, 종료 후엔 자동** | AI 정리 갱신은 라이브=수동 / 종료=자동 |
| P4 | **트랜스크립트는 일회성 기록이 아니다** | 시간 클릭 → 노트로 인용 앵커링, 화자 이름 인라인 편집 |
| P5 | **시작 방법은 4가지, 도착지는 하나** | 텍스트/오디오/실시간/화상 → 모두 동일한 노트 구조로 수렴 |
| P6 | **라이트 미니멀 (Notion/Granola 톤)** | 다크 사이드바 금지, 액센트 컬러 절제, 화자만 4색 시스템 |

---

## 2. 정보 아키텍처 (라우트)

```
/                        랜딩 — 4가지 입구
/new/text                텍스트로 빈 노트 생성
/new/audio               오디오 파일 업로드
/new/live                라이브 녹음 — 참여자 사전 등록 → 녹음
/new/video               화상 회의 봇 연결
/notes                   노트 목록 (사이드바 = 이 라우트의 미니뷰)
/notes/:id               노트 상세 (라이브/검토 통합 화면)
/notes/:id?export=1      내보내기 모달 (querystring 또는 modal route)
```

---

## 3. 화면 인벤토리

| ID | 화면 | 진입 | 핵심 상태 |
|---|---|---|---|
| S0 | 랜딩 | `/` | 4 메소드 카드 + 최근 노트 3 |
| S1a | 텍스트 입력 | 랜딩 → 텍스트 카드 | 제목, 일시, 본문 textarea |
| S1b | 오디오 업로드 | 랜딩 → 오디오 카드 | 드롭존 / 업로드 중 / 옵션 |
| S1c | 화상 회의 연결 | 랜딩 → 화상 카드 | 플랫폼 선택, URL, 캘린더 자동 참여 |
| S1d | 라이브 — 참여자 사전 등록 | 랜딩 → 실시간 카드 | 캘린더 자동 제안 + 수동 추가 |
| S2 | 모델 다운로드 | 최초 1회만 노출 | 91MB · 2개 모델 진행률 |
| S3 | 라이브 노트 | 사전 등록 완료 후 | 트랜스크립트(좌) + 노트(우) |
| S3-prompt | 새 화자 매핑 프롬프트 | 미등록 화자 첫 발화 감지 시 | 후보 3개 + 새 추가 + 나중에 |
| S4 | 검토 모드 | 녹음 종료 후 자동 전환 | 노란 배너 + 재생 컨트롤 |
| S5 | 내보내기 모달 | S3/S4 헤더 → 다운로드 버튼 | PDF / Markdown / Word / 오디오 |

---

## 4. 디자인 토큰

CSS 변수로 정의되어 있음 (`styles.css :root`). 그대로 옮기거나 동등한 토큰 시스템으로 매핑하세요.

### 4.1 색상

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#fafaf9` | 페이지 배경 |
| `--surface` | `#ffffff` | 카드/패널 |
| `--surface-2` | `#f6f6f4` | 보조 표면 (호버, hover row) |
| `--surface-3` | `#efeeec` | 비활성/disabled |
| `--border` | `#ececea` | 1px 디바이더 |
| `--border-strong` | `#d8d7d4` | 강조 보더 (focus, hover) |
| `--ink` | `#18181b` | 본문 텍스트 |
| `--ink-2~5` | (단계적으로 옅어짐) | 보조 텍스트, 메타, placeholder |
| `--rec` | `#dc2626` | 녹음 중 표시 (절대 다른 곳에 쓰지 말 것) |
| `--info` | `#2563eb` | 인포 / 링크 |
| `--warn` | `#b45309` | 경고 / 미해결 질문 |
| `--sp1~4` | indigo/teal/amber/pink | 화자 색상 (4명까지, 5번째부터 회전) |

### 4.2 타이포

- **Font stack**: Pretendard Variable → Apple SD Gothic Neo → Noto Sans KR → system-ui
- **Mono**: ui-monospace → SF Mono → JetBrains Mono
- 본문 13.5px / 메타 11~12px / 헤더 13~26px / 라이브 토큰 letter-spacing 미세조정

### 4.3 모서리 / 그림자

- 카드 10–14px, 칩 999px, 작은 요소 6–8px
- 그림자는 거의 없음 (라이트 미니멀). 모달/플로팅만 `--shadow-2/3`

---

## 5. 컴포넌트 사양

### 5.1 노트 도큐먼트 (8 블록)

각 블록은 **공통 인터페이스**를 갖습니다:

```ts
type NoteBlock = {
  id: string;
  type: 'ai_summary' | 'context' | 'decisions' | 'actions' | 'questions'
       | 'participants' | 'next_agenda' | 'free_memo';
  data: BlockData;       // 타입별 스키마
  source: 'auto' | 'manual';
  updatedAt: ISODate;
  hidden?: boolean;      // 사용자가 숨길 수 있음
};
```

| 블록 | 데이터 | 자동 생성 | 사용자 편집 | 비고 |
|---|---|---|---|---|
| ai_summary | `{ bullets: string[] }` | ✅ | ❌ (재생성만) | 마크다운 `**bold**` 지원 |
| context | `{ paragraphs, quotes[] }` | 부분 | ✅ | quote는 트랜스크립트 anchorId 보유 |
| decisions | `string[]` | ❌ (또는 LLM 추출) | ✅ | 인라인 추가 |
| actions | `{ who, what, when, done }[]` | LLM 추출 권장 | ✅ | 체크박스, 담당자 멘션 |
| questions | `string[]` | LLM 추출 | ✅ | 미해결 표시 |
| participants | `Participant[]` | 화자 다이어리제이션 | ✅ (이름/역할) | sp 번호 ↔ 이름 매핑 |
| next_agenda | `string[]` | ❌ | ✅ | |
| free_memo | rich text | ❌ | ✅ | contentEditable, slash command 지원 권장 |

**중요**: AI가 자동 생성하는 블록(ai_summary, context의 일부, actions, questions)은 사용자 편집 시 `source: 'manual'`로 전환되어 **다음 자동 갱신에서 보호됨**. 이게 P2 원칙의 구현입니다.

### 5.2 트랜스크립트 turn

```ts
type Turn = {
  id: string;
  speakerId: number;     // 1~N (sp1~spN 색상에 매핑)
  startMs: number;       // 오디오 타임스탬프
  endMs: number;
  text: string;
  typing?: boolean;      // 라이브 받아쓰기 중
  anchored?: boolean;    // 노트에 인용된 적 있음 (북마크 표시)
};
```

화자 이름은 별도 `SpeakerMap: { [speakerId]: { name, role, initials } }`로 관리. turn에 직접 저장하지 않음 (이름 변경 시 일괄 반영).

### 5.3 화자 색상 시스템

- 1~4번: 정해진 4색 팔레트
- 5번부터: 1~4 색상 순환 (`speakerId % 4`)
- Tweaks에서 4가지 테마 (default/warm/cool/mono) — 디자인 데모용. 운영 시 default 고정 권장.

---

## 6. 핵심 인터랙션

### 6.1 트랜스크립트 시간 → 노트 앵커링

```
액션: 트랜스크립트의 timestamp(예 "01:03") 클릭
시스템:
  1. 해당 turn을 anchored 상태로 마킹
  2. 노트의 'context' 블록 하단에 quote 카드 추가
  3. quote 카드는 turn.id 참조 → 클릭 시 트랜스크립트 해당 위치로 점프 + 하이라이트 1.5초
UI: 부드러운 등장 애니메이션, focus는 노트 측에
```

### 6.2 화자 이름 인라인 편집

```
액션: 트랜스크립트의 화자 이름 라벨(예 "김태현") 클릭
시스템:
  1. 라벨이 input으로 전환
  2. Enter / blur 시 SpeakerMap[speakerId].name 업데이트
  3. 모든 turn의 라벨 + 참여자 블록 + 액션 아이템 멘션이 일괄 갱신
경계 케이스: 빈 문자열로 저장 시 "화자 N"으로 fallback
```

### 6.3 새 화자 첫 발화 감지 (S3-prompt)

```
조건: 음성 임베딩 클러스터에 없던 새 speakerId가 처음 등장
시스템:
  1. 인라인 프롬프트를 트랜스크립트 좌측에 띄움 (해당 turn 옆 화살표)
  2. 옵션:
     - 사전 등록된 미매칭 참여자 N명 (키보드 1, 2, 3...)
     - "+ 새 참여자로 추가"
     - "나중에" (프롬프트만 닫고 나중에 인라인 편집 가능)
  3. 선택 시 SpeakerMap 업데이트 + 프롬프트 닫힘 + 트랜스크립트는 끊김 없이 계속
중요: 라이브 받아쓰기는 절대 멈추지 않음. 프롬프트는 비차단.
```

### 6.4 AI 정리 갱신 정책

| 상태 | 트리거 | UI |
|---|---|---|
| 라이브 — 새 발화 ≥ 10개 누적 | 자동 안 함 | "새 발화 12개" 스테일 뱃지 + "다시 정리" 버튼 활성 |
| 라이브 — "다시 정리" 클릭 | 수동 갱신 | 1.4초 로딩 → 갱신 |
| 녹음 종료 | 자동 1회 갱신 | "회의 종료 직후 자동 갱신" 메타 표시 |
| 검토 모드 — 사용자가 트랜스크립트/메모 편집 | 자동 안 함 | "다시 정리" 버튼만 |

### 6.5 녹음 종료 → 검토 모드

```
액션: 녹음 종료 버튼 클릭
시스템:
  1. 오디오 마무리 + 최종 전사 처리
  2. AI 정리 자동 1회 실행
  3. 상단에 노란 배너 노출 ("녹음 종료됨, AI 정리 갱신 완료")
  4. 트랜스크립트 하단 컨트롤이 녹음 → 재생으로 전환
  5. 사이드바의 "진행 중" 섹션에서 제거, "오늘"로 이동
레이아웃: 변하지 않음 (사용자 컨텍스트 유지)
```

---

## 7. 4가지 입구별 데이터 흐름

### 7.1 실시간 녹음 (S1d → S2(최초만) → S3 → S4)

```
브라우저 마이크 → MediaRecorder (webm/opus)
  → ML 모델 (브라우저 로컬, Whisper Base + WeSpeaker)
  → turn 스트림 → WebSocket or local state
  → AI 정리는 LLM API (서버) 호출
```

- **모델 다운로드 91MB** — 최초 1회, IndexedDB 캐시
- 오프라인 동작: 전사·화자 구분은 로컬, AI 정리는 온라인 필요

### 7.2 오디오 업로드 (S1b → S4)

```
파일 업로드 (직접 PUT to S3 권장)
  → 백엔드 작업 큐 (전사, 화자 분리)
  → 완료 시 노트 생성 + S4 검토 모드로 진입
지원 포맷: mp3, m4a, wav, webm, flac, ogg
한도: 2시간 / 4GB
```

진행률은 두 단계: **업로드(0–100%) → 처리 중(스피너)**.

### 7.3 텍스트 입력 (S1a → S3 변형)

```
트랜스크립트 패널 숨김
노트 영역 100%
AI 정리는 본문 텍스트를 입력으로 사용
```

데이터 모델은 동일. `transcript: []` 빈 배열, `entryMethod: 'text'` 필드만 추가.

### 7.4 화상 회의 (S1c → S3)

```
사용자가 회의 URL 입력 → 백엔드가 봇 인스턴스 띄움
봇이 회의 입장 (참여자로 표시: "AutoNote 노트 작성 중")
오디오만 캡처 → 7.1과 동일한 처리
캘린더 연동 시: webhook으로 자동 봇 입장 예약
```

**컴플라이언스**: 봇 입장 사실을 회의 참석자에게 명시 (봇 이름 + 화면 미표시).

---

## 8. 상태 관리

권장 구조:

```ts
type AppState = {
  notes: { [id]: Note };
  currentNoteId?: string;
  speakerMap: { [speakerId]: Speaker };  // 노트별로 분리
  recording?: {
    state: 'idle' | 'preparing' | 'recording' | 'paused' | 'ended';
    startedAt?: number;
    pendingTurns: Turn[];   // 받아쓰기 중인 임시 turn
  };
  ui: {
    sidebarCollapsed: boolean;
    activeKeywords: Set<string>;
    speakerPromptFor?: number;  // S3-prompt 표시 대상
  };
};
```

서버 동기화는 노트 단위 + 블록 단위 patch (concurrent 편집 대응 권장).

---

## 9. 접근성 / i18n

- 키보드: 화자 매핑 프롬프트 1/2/3, 트랜스크립트 시간 점프 Enter, 검토 모드 스페이스(재생)
- 콘트라스트: ink-3 이상은 본문 사용 금지 (4.5:1 미만)
- 화자 색만으로 구분 금지 — 항상 이름 라벨 동반
- ko-KR 기본, en/ja 대비 textarea 폰트 fallback 검증 필요

---

## 10. 미정 / 추후 결정 항목

- [ ] 캘린더 연동 — Google/Outlook 어느 것부터?
- [ ] 봇 인프라 — 자체 호스팅 vs Recall.ai 등 BaaS
- [ ] AI 정리 LLM 모델 — Claude Haiku vs 다른 옵션 (비용/지연 트레이드오프)
- [ ] 액션 아이템 자동 추출 정책 — 모든 회의 vs 사용자 토글
- [ ] 화자 사전 등록 데이터 — 조직 인명부와 연동 여부
- [ ] 오프라인 충돌 해결 — 노트 단위 last-writer-wins로 충분한가?
- [ ] 데이터 보존 — 오디오 원본 보관 기간 / GDPR 삭제 요청

---

## 11. 디자인 산출물 — 어디서 볼지

| 항목 | 위치 |
|---|---|
| 모든 화면 모음 | `AutoNote UI 개선안 (standalone).html` (캔버스 ⓪~⑥) |
| 디자인 토큰 | `styles.css` `:root` |
| 화면별 추가 토큰 | `styles2.css` (V2), `styles3.css` (화자), `styles4.css` (랜딩) |
| 컴포넌트 코드 | `v2-final.jsx`, `landing.jsx`, `speaker-flow.jsx` |
| 데이터 목업 | `data.jsx`, `data2.jsx` |

> 코드는 **구현 참고용**입니다. React/Babel을 그대로 쓰지 마시고, 프로젝트의 빌드 시스템에 맞게 옮겨주세요. 시각적 결과물은 standalone HTML이 진실의 원천(source of truth).

---

## 12. 디자이너 미팅 가이드

핸드오프 후 첫 미팅에서 다음을 함께 확인하면 좋습니다:

1. **standalone HTML을 같이 클릭해보기** — 화면별로 한 번씩
2. **§10 미정 항목** 우선순위 정하기
3. **8개 노트 블록 중 v1에 들어갈 것** 정하기 (전체 출시 vs 단계 출시)
4. **백엔드 API 형태** 확정 — 노트/turn/speaker 스키마 합의
5. **모델 다운로드 UX** 확정 — 차단/논블로킹/lazy 중 선택

---

질문은 언제든. 디자인 결정의 *이유*가 궁금하면 §1을 먼저 보고, 그래도 답이 안 나오면 물어봐주세요.
