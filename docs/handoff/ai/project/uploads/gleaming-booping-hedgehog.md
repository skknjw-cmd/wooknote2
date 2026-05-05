# 오프라인 Whisper STT + ClovaNote 스타일 UI 전면 개편

## Context

현재 autonote는 Gemini 2.5 Flash API로 STT를 처리하는데, API 오류가 잦고 인터넷 연결이 필수다. 사용자가 원하는 것:
1. **오프라인 동작** — 최초 1회 모델 다운로드 후 인터넷 없이 STT 가능 (`@huggingface/transformers` Whisper ONNX)
2. **실시간 화자 구분** — 10초 단위 청크, Whisper 세그먼트 타임스탬프로 오디오 슬라이스 → WeSpeaker 임베딩
3. **UI 전면 개편** — 3단 레이아웃 (좌: 노트 목록 / 중: 실시간 트랜스크립트 / 우: 메모)

---

## 아키텍처 개요

```
[브라우저 UI Thread]
  ├── AppShell (3단 CSS Grid)
  │   ├── NoteList (좌측 240px) — IndexedDB 노트 히스토리
  │   ├── LiveTranscript (중앙 flex-1) — 실시간 화자 버블
  │   └── MemoPanel (우측 320px) — 메모 + AI 요약
  │
  ├── WhisperWorker (Web Worker) ← 큐 시스템 내장
  │   └── @huggingface/transformers whisper-base (q4 양자화)
  │       chunk_length_s: 10, stride_length_s: 2  ← 경계 단어 보호
  │       → {text, segments: [{start, end, text}]}
  │
  └── SpeakerWorker (Web Worker)
      └── WeSpeaker ONNX (fp16)
          입력: Whisper segments 타임스탬프로 슬라이스한 Float32Array
          출력: 128차원 임베딩 → 코사인 유사도 → 화자 레이블
```

---

## 오디오 처리 파이프라인

```
MediaRecorder (10초 Blob)
  │
  ▼
WhisperWorker (큐에 enqueue → 순차 처리)
  └─ stride_length_s: 2 오버랩 자동 처리 (API 파라미터)
  └─ 출력: segments = [{start: 0.5, end: 3.2, text: "..."}, ...]
  │
  ▼ 각 segment마다
AudioBuffer.getChannelData(0).subarray(
  Math.floor(seg.start * sampleRate),
  Math.ceil(seg.end * sampleRate)
)  ← AudioContext.slice() 없음. PCM 직접 슬라이싱
  │
  ▼
SpeakerWorker
  └─ WeSpeaker → 128차원 임베딩
  └─ 코사인 유사도 vs speakerCentroids (임계값 0.75)
  └─ 화자 레이블 결정 ("화자 1", "화자 2" ...)
  │
  ▼
UI: SpeakerBubble append {speakerLabel, text, startMs, endMs}
```

---

## 주요 기술 결정

### 1. next.config.ts — Node 전용 모듈 무시 필수

`@huggingface/transformers`는 Node/브라우저 공용 패키지라, Next.js 빌드 시
`fs`, `path`, `onnxruntime-node`를 찾지 못하는 에러가 발생한다.
클라이언트 번들에서 반드시 제외해야 한다.

```typescript
// next.config.ts
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'sharp$': false,
      'onnxruntime-node$': false,
    }
    return config
  },
}
```

Worker 파일은 `new Worker(new URL('../workers/whisper.worker.ts', import.meta.url))`
패턴으로 로드해 Next.js가 별도 번들로 처리하도록 한다.

### 2. AudioBuffer PCM 슬라이싱 (AudioContext.slice 없음)

```typescript
function sliceAudioBuffer(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number
): Float32Array {
  const sr = buffer.sampleRate
  const startIdx = Math.floor(startSec * sr)
  const endIdx = Math.ceil(endSec * sr)
  // subarray는 복사 없이 뷰만 반환 (성능 유리)
  return buffer.getChannelData(0).subarray(startIdx, endIdx)
}
```

### 3. 양자화 + 저사양 폴백

```typescript
const modelId = navigator.hardwareConcurrency <= 4
  ? 'Xenova/whisper-tiny'   // ~39MB
  : 'Xenova/whisper-base'   // ~74MB

const pipe = await pipeline('automatic-speech-recognition', modelId, {
  dtype: {
    encoder_model: 'fp16',
    decoder_model_merged: 'q4',
  },
  chunk_length_s: 10,
  stride_length_s: 2,
  return_timestamps: 'word',
  progress_callback: (p) => self.postMessage({ type: 'download_progress', ...p }),
})
```

### 4. 최초 로드 — 다운로드 프로그레스 바 UI

첫 실행 시 (브라우저 캐시 없음) 인터넷 연결이 필요하고 약 ~100MB 다운로드가 발생한다.
이후에는 브라우저 Cache API가 자동 캐싱하여 완전 오프라인 동작.

```
┌────────────────────────────────────────────┐
│  AI 모델 초기화 중                          │
│  Whisper (음성 인식) 다운로드 중...         │
│  ████████████░░░░░░░░  58% (43MB / 74MB)   │
│                                            │
│  최초 1회만 필요합니다.                    │
│  이후에는 인터넷 없이 동작합니다.           │
└────────────────────────────────────────────┘
```

Workers에서 `progress_callback`으로 진행률을 postMessage → UI의 `ModelLoadingOverlay` 컴포넌트에 표시.

### 5. 청크 큐 시스템 (데이터 유실 방지)

```typescript
class TranscriptionQueue {
  private queue: Blob[] = []
  private isProcessing = false

  enqueue(chunk: Blob) {
    this.queue.push(chunk)
    if (!this.isProcessing) this.processNext()
  }

  private async processNext() {
    if (this.queue.length === 0) { this.isProcessing = false; return }
    this.isProcessing = true
    const chunk = this.queue.shift()!
    await this.transcribe(chunk)
    this.processNext()
  }
}
```

### 6. IndexedDB 저장 구조

```typescript
type NoteRecord = {
  id: string
  title: string
  createdAt: number
  segments: Segment[]           // 트랜스크립트 (types/meeting.ts 재사용)
  speakerMapping: Record<string, string>
  audioBlob: Blob               // 전체 녹음 원본 — 타임스탬프 클릭 재생용
  audioDuration: number         // ms
  keywords: string[]
  memo: string
}
```

---

## UI 레이아웃

```
┌──────────────┬────────────────────────────────┬───────────────┐
│ 노트 목록    │  새로운 노트              ∨ ⬇  │ 메모·요약     │
│              │  키워드: 스펀지 플랫 비축 수량  │               │
│ ▶ 새 노트   │ ──────────────────────────────  │ AI가 요약한   │
│   오늘       │  ① 화자 1  00:05               │ 핵심 내용을   │
│   어제 회의  │  "아이고 괜히 뭐 그것 때문에"  │ 확인해보세요. │
│              │                                │               │
│ 기본폴더     │  ② 화자 2  00:27               │ [메모 추가]   │
│              │  "정확한 수치가 안 나와 왜..."  │               │
│              │ ──────────────────────────────  │               │
│              │  [●] 녹음 중  00:35:07          │               │
│              │  ──────○────────────  1x  ⏮ ▶ ⏭│               │
└──────────────┴────────────────────────────────┴───────────────┘
```

---

## 파일 목록

### 새로 만들 파일
| 파일 | 역할 |
|------|------|
| `src/workers/whisper.worker.ts` | Whisper ONNX + TranscriptionQueue |
| `src/workers/speaker.worker.ts` | WeSpeaker 임베딩 + 코사인 클러스터링 |
| `src/hooks/useOfflineSTT.ts` | Workers 생명주기 + UI 상태 연결 |
| `src/components/Layout/AppShell.tsx` | 3단 CSS Grid 레이아웃 |
| `src/components/Layout/ModelLoadingOverlay.tsx` | 최초 다운로드 프로그레스 바 |
| `src/components/Sidebar/NoteList.tsx` | 좌측 노트 히스토리 |
| `src/components/Recording/LiveTranscript.tsx` | 실시간 화자 버블 목록 |
| `src/components/Recording/SpeakerBubble.tsx` | 발화 버블 (클릭 → 해당 시점 재생) |
| `src/components/Recording/RecordingBar.tsx` | 하단 녹음 컨트롤 + 타이머 |
| `src/components/Memo/MemoPanel.tsx` | 우측 메모 + 요약 패널 |
| `src/lib/db.ts` | IndexedDB CRUD (NoteRecord 스키마) |
| `src/lib/audioSlice.ts` | `sliceAudioBuffer()` 유틸 |

### 수정할 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/page.tsx` | AppShell + ModelLoadingOverlay 사용 |
| `src/components/InputSection/InputTabs.tsx` | 녹음 로직 → `useOfflineSTT` 위임 |
| `package.json` | `@huggingface/transformers` 추가 |
| `next.config.ts` | `onnxruntime-node`, `sharp` alias false 처리 |

### 유지 (변경 없음)
- `src/lib/speakerMerge.ts`, `src/types/meeting.ts`
- `src/app/api/analyze/route.ts`, `src/app/api/stt-gemini/route.ts`
- `src/app/result/page.tsx`

---

## 첫 단계: HTML 목업 생성

계획 승인 후 첫 번째 액션:
1. `docs/mockup/clovanote-ui.html` 생성 — 정적 인터랙티브 목업
2. 사용자 확인/수정 후 피드백
3. 목업 확정 후 구현 착수

## 검증 방법

1. 첫 로드 → 프로그레스 바 표시 → 모델 다운로드 완료 확인
2. 인터넷 차단 → 재방문 → 오프라인 녹음 동작 확인
3. 2인 대화 → 화자 1/2 자동 구분 확인
4. `hardwareConcurrency <= 4` 시뮬레이션 → tiny 폴백 확인
5. 녹음 저장 → 새로고침 → 사이드바 복원 + 오디오 재생 확인
6. Vercel 배포 후 빌드 에러 없음 확인 (webpack alias 설정 검증)
