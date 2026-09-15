# 녹음 발화 버퍼 노트별 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `useOfflineSTT`에서 발화·참석자 상태를 걷어내고 `NoteRecord.segments`를 트랜스크립트의 유일한 출처로 만들어, 연속 녹음 시 이전 회의가 섞이는 버그를 없앤다.

**Architecture:** 훅은 오디오(마이크·청크·워치독·STT 호출)만 담당하고 가공되지 않은 조각을 콜백으로 내보낸다. 순수 함수 `assembleTurns`가 조각을 발화로 조립하고, `page.tsx`가 그 결과를 녹음 중인 노트에 반영한다. 확장→이관→축소(expand/migrate/contract) 순서로 진행해 모든 작업 단계에서 빌드가 초록이다.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19, vitest + jsdom

**Spec:** `docs/superpowers/specs/2026-09-15-stt-buffer-per-note-design.md`

## Global Constraints

- **훅은 발화를 소유하지 않는다.** 작업이 끝나면 `useOfflineSTT`에 `turns` / `turnsRef` / `segIdRef` / `getLatestTurns` / `editTurn` / `splitTurn` / `participants` / `setParticipants` / `updateSpeakerName`이 남아 있으면 안 된다.
- **`TurnSegment` 스키마를 바꾸지 않는다.** `{ id: number; sp: number; t: string; text: string; typing?: boolean; anchored?: boolean }` 그대로. 기존 노트 마이그레이션이 없어야 한다.
- **화자 번호는 두 레이블 경로 모두 `speakerBase`를 반영한다.** 숫자 레이블(Gemini)은 `parsed + (speakerBase - 1)`, 문자 레이블(OpenAI)은 `speakerBase + letterMap.size`. 이걸 빠뜨리면 스펙 §4가 Gemini에서만 조용히 깨진다.
- **새 녹음은 기존과 완전히 동일하게 동작한다.** 새 녹음은 `baseMs = 0`, `speakerBase = 1`이다.
- **동시 녹음은 지원하지 않는다.** 녹음 중 새 녹음 시도는 막는다.
- **`LiveTranscript.tsx`와 `NoteDocument.tsx`는 수정하지 않는다.** 이미 props로 받으므로 넘기는 값만 바뀐다.
- **주석과 UI 문구는 한국어.**
- **테스트 기준선:** `npm test`는 105개 중 104개 통과가 정상이다. `src/lib/meetingStorage.test.ts > round-trips a v2 save/load`는 `main`에서도 실패하는 기존 문제이므로 고치지 않는다.
- **커밋 메시지 끝에 붙일 것:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: `turnAssembly.ts` — 발화 조립 순수 함수

**Files:**
- Create: `src/lib/turnAssembly.ts`
- Create: `src/lib/turnAssembly.test.ts`

**Interfaces:**
- Consumes: `TurnSegment` from `@/types/meeting` (기존)
- Produces: `RawSegment`, `AssembleOptions`, `formatTime`, `nextSpeakerBase`, `assembleTurns` — Task 3이 전부 사용한다.

이 작업은 소비처가 없는 독립 모듈이다. 빌드와 무관하게 테스트만으로 검증된다.

**설계 메모 (구현자가 알아야 할 것):**
- `id`는 옵션으로 받지 않고 `prev`의 최대 `id`에서 이어 붙인다. 호출자가 카운터를 들고 다닐 필요가 없다.
- `letterMap`은 **호출자가 소유하며 이 함수가 변형한다.** 녹음 세션 하나 동안 유지된다.
- `speakerBase`는 세션 시작 시 한 번 정해지고 청크마다 바뀌지 않는다. 청크마다 다시 계산하면 세션 자신이 만든 화자 때문에 번호가 계속 밀린다.
- `isFirstChunkOfSession`은 **이전 세션의 마지막 발화에 이어붙이는 것만** 막는다. 첫 청크 안에서 같은 화자가 연달아 나오면 정상적으로 병합된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/turnAssembly.test.ts` 생성:

```ts
import { describe, it, expect } from "vitest";
import { formatTime, nextSpeakerBase, assembleTurns, type RawSegment } from "./turnAssembly";
import type { TurnSegment } from "@/types/meeting";

const turn = (id: number, sp: number, t: string, text: string): TurnSegment => ({ id, sp, t, text });

/** 기본 옵션. 각 테스트에서 필요한 값만 덮어쓴다. */
function opts(over: Partial<Parameters<typeof assembleTurns>[2]> = {}) {
  return {
    baseMs: 0,
    chunkStartMs: 0,
    letterMap: new Map<string, number>(),
    speakerBase: 1,
    isFirstChunkOfSession: false,
    ...over,
  };
}

describe("formatTime", () => {
  it("밀리초를 MM:SS로 바꾼다", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(12_000)).toBe("00:12");
    expect(formatTime(125_000)).toBe("02:05");
  });

  it("60분을 넘으면 분이 계속 늘어난다", () => {
    expect(formatTime(3_725_000)).toBe("62:05");
  });
});

describe("nextSpeakerBase", () => {
  it("발화가 없으면 1", () => {
    expect(nextSpeakerBase([])).toBe(1);
  });

  it("최대 화자 번호 다음", () => {
    expect(nextSpeakerBase([turn(1, 1, "00:00", "a"), turn(2, 2, "00:01", "b")])).toBe(3);
  });

  it("번호가 띄엄띄엄해도 최대값 기준", () => {
    expect(nextSpeakerBase([turn(1, 5, "00:00", "a")])).toBe(6);
  });
});

describe("assembleTurns", () => {
  const seg = (clovaLabel: string, text: string): RawSegment => ({ clovaLabel, text });

  it("빈 조각 배열이면 prev를 그대로 돌려준다", () => {
    const prev = [turn(1, 1, "00:00", "안녕")];
    expect(assembleTurns(prev, [], opts())).toEqual(prev);
  });

  it("prev를 변형하지 않는다", () => {
    const prev = [turn(1, 1, "00:00", "안녕")];
    const snapshot = JSON.parse(JSON.stringify(prev));
    assembleTurns(prev, [seg("1", "반갑습니다")], opts());
    expect(prev).toEqual(snapshot);
  });

  it("공백뿐인 조각은 버린다", () => {
    expect(assembleTurns([], [seg("1", "   ")], opts())).toEqual([]);
  });

  it("같은 화자가 연달아 나오면 한 발화로 합친다", () => {
    const out = assembleTurns([], [seg("1", "안녕"), seg("1", "하세요")], opts());
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("안녕 하세요");
  });

  it("화자가 바뀌면 새 발화를 만든다", () => {
    const out = assembleTurns([], [seg("1", "안녕"), seg("2", "네")], opts());
    expect(out.map((t) => [t.sp, t.text])).toEqual([[1, "안녕"], [2, "네"]]);
  });

  it("id는 prev의 최대값에서 이어진다", () => {
    const out = assembleTurns([turn(7, 1, "00:00", "a")], [seg("2", "b"), seg("3", "c")], opts());
    expect(out.map((t) => t.id)).toEqual([7, 8, 9]);
  });

  it("baseMs와 chunkStartMs를 더해 시각을 만든다", () => {
    const out = assembleTurns([], [seg("1", "안녕")], opts({ baseMs: 600_000, chunkStartMs: 15_000 }));
    expect(out[0].t).toBe("10:15");
  });

  it("문자 레이블을 화자 번호로 매핑한다", () => {
    const letterMap = new Map<string, number>();
    const out = assembleTurns([], [seg("A", "안녕"), seg("B", "네")], opts({ letterMap }));
    expect(out.map((t) => t.sp)).toEqual([1, 2]);
    expect(letterMap.get("A")).toBe(1);
    expect(letterMap.get("B")).toBe(2);
  });

  it("같은 문자가 다시 나오면 같은 화자 번호를 쓴다", () => {
    const letterMap = new Map<string, number>();
    assembleTurns([], [seg("A", "안녕")], opts({ letterMap }));
    const out = assembleTurns([], [seg("B", "네"), seg("A", "다시")], opts({ letterMap }));
    expect(out.map((t) => t.sp)).toEqual([2, 1]);
  });

  // ── speakerBase (스펙 §6 주의) ──

  it("speakerBase가 1이면 숫자 레이블이 그대로 화자 번호가 된다 (기존 동작 보존)", () => {
    const out = assembleTurns([], [seg("1", "안녕"), seg("2", "네")], opts({ speakerBase: 1 }));
    expect(out.map((t) => t.sp)).toEqual([1, 2]);
  });

  it("speakerBase가 3이면 숫자 레이블도 밀려서 3, 4가 된다", () => {
    const out = assembleTurns([], [seg("1", "안녕"), seg("2", "네")], opts({ speakerBase: 3 }));
    expect(out.map((t) => t.sp)).toEqual([3, 4]);
  });

  it("speakerBase가 3이면 문자 레이블도 3부터 시작한다", () => {
    const letterMap = new Map<string, number>();
    const out = assembleTurns([], [seg("A", "안녕"), seg("B", "네")], opts({ speakerBase: 3, letterMap }));
    expect(out.map((t) => t.sp)).toEqual([3, 4]);
  });

  it("레이블 0은 1로 본 뒤 speakerBase를 더한다", () => {
    const out = assembleTurns([], [seg("0", "안녕")], opts({ speakerBase: 3 }));
    expect(out[0].sp).toBe(3);
  });

  // ── 이어 녹음 첫 청크 ──

  it("이어 녹음 첫 청크는 화자가 같아도 이전 세션 발화에 합치지 않는다", () => {
    const prev = [turn(1, 1, "00:10", "1차 마지막")];
    const out = assembleTurns(prev, [seg("1", "2차 첫마디")], opts({ isFirstChunkOfSession: true }));
    expect(out).toHaveLength(2);
    expect(out[1].text).toBe("2차 첫마디");
  });

  it("이어 녹음 첫 청크 안에서는 같은 화자끼리 정상적으로 합친다", () => {
    const prev = [turn(1, 1, "00:10", "1차 마지막")];
    const out = assembleTurns(
      prev,
      [seg("1", "2차"), seg("1", "첫마디")],
      opts({ isFirstChunkOfSession: true }),
    );
    expect(out).toHaveLength(2);
    expect(out[1].text).toBe("2차 첫마디");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/turnAssembly.test.ts`
Expected: FAIL — `Failed to resolve import "./turnAssembly"`

- [ ] **Step 3: 구현 작성**

`src/lib/turnAssembly.ts` 생성:

```ts
import type { TurnSegment } from "@/types/meeting";

/** STT 라우트가 돌려주는 가공 전 발화 조각. */
export type RawSegment = { clovaLabel: string; text: string };

export type AssembleOptions = {
  /** 이어 녹음 오프셋. 이 녹음이 시작될 때 노트가 이미 가지고 있던 길이(ms). */
  baseMs: number;
  /** 이번 청크가 이 녹음 안에서 시작된 시각(ms). */
  chunkStartMs: number;
  /** "A" → 화자 번호. 호출자가 소유하며 이 함수가 변형한다. 녹음 세션 동안 유지된다. */
  letterMap: Map<string, number>;
  /** 이 세션이 쓸 첫 화자 번호. 세션 시작 시 한 번 정해지고 청크마다 바뀌지 않는다. */
  speakerBase: number;
  /** 이 세션의 첫 청크인가. 이전 세션 마지막 발화에 이어붙이는 것을 막는다. */
  isFirstChunkOfSession: boolean;
};

/** 밀리초를 "MM:SS"로. 60분을 넘으면 분이 계속 늘어난다. */
export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 기존 발화에서 다음 세션이 쓸 첫 화자 번호를 구한다. 비어 있으면 1. */
export function nextSpeakerBase(prev: TurnSegment[]): number {
  if (prev.length === 0) return 1;
  return Math.max(...prev.map((t) => t.sp)) + 1;
}

function nextTurnId(prev: TurnSegment[]): number {
  if (prev.length === 0) return 0;
  return Math.max(...prev.map((t) => t.id));
}

/**
 * 가공 전 조각을 기존 발화 뒤에 조립한다. prev를 변형하지 않고 새 배열을 반환한다.
 *
 * 화자 번호는 숫자·문자 레이블 양쪽 모두 speakerBase를 반영한다. 숫자 쪽을
 * 빠뜨리면 Gemini를 쓰는 이어 녹음에서 2차 세션이 1, 2를 다시 반환하는 순간
 * 1차 세션의 화자와 번호가 충돌해 서로 다른 사람이 합쳐진다.
 */
export function assembleTurns(
  prev: TurnSegment[],
  segments: RawSegment[],
  opts: AssembleOptions,
): TurnSegment[] {
  const next = [...prev];
  let id = nextTurnId(prev);
  // 이어 녹음 첫 청크는 이전 세션 마지막 발화에 합치지 않는다.
  // 이 세션이 발화를 하나 만든 뒤부터는 같은 청크 안에서 정상 병합한다.
  let allowMerge = !opts.isFirstChunkOfSession;

  for (const seg of segments) {
    const text = seg.text?.trim();
    if (!text) continue;

    let sp: number;
    const parsed = parseInt(seg.clovaLabel, 10);
    if (!isNaN(parsed)) {
      sp = (parsed || 1) + (opts.speakerBase - 1);
    } else {
      const letter = seg.clovaLabel.trim();
      if (!opts.letterMap.has(letter)) {
        opts.letterMap.set(letter, opts.speakerBase + opts.letterMap.size);
      }
      sp = opts.letterMap.get(letter)!;
    }

    const last = next[next.length - 1];
    if (allowMerge && last && last.sp === sp) {
      next[next.length - 1] = { ...last, text: `${last.text} ${text}` };
    } else {
      next.push({ id: ++id, sp, t: formatTime(opts.baseMs + opts.chunkStartMs), text });
      allowMerge = true;
    }
  }

  return next;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/turnAssembly.test.ts`
Expected: PASS (21 tests)

- [ ] **Step 5: 전체 스위트 확인**

Run: `npm test`
Expected: 126개 중 125개 통과 (기존 104/105 + 신규 21). 유일한 실패는 `meetingStorage.test.ts`.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/turnAssembly.ts src/lib/turnAssembly.test.ts
git commit -m "$(cat <<'MSG'
feat(stt): 발화 조립 순수 함수 turnAssembly 추가

화자 번호는 숫자·문자 레이블 양쪽 모두 speakerBase를 반영한다.
이어 녹음 첫 청크는 이전 세션 마지막 발화에 병합하지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: 훅에 새 API 추가 (확장 — 기존 동작 유지)

**Files:**
- Modify: `src/hooks/useOfflineSTT.ts`

**Interfaces:**
- Consumes: `RawSegment` (Task 1)
- Produces: `recordingNoteId: string | null`, `startRecording(noteId?: string, handlers?: RecordingHandlers)`, `type ChunkHandler`, `type RecordingHandlers` — Task 3이 사용한다.

이 작업은 **추가만** 한다. 기존 `turns` / `editTurn` / `participants` 등은 그대로 두고 계속 동작한다. 그래야 `page.tsx`가 깨지지 않고 빌드가 초록으로 유지된다. 제거는 Task 4에서 한다.

**구현자가 알아야 할 것:**
- `startRecording`의 새 인자는 **선택적**이다. `page.tsx`는 아직 인자 없이 호출한다.
- `processChunk`는 STT 프롬프트에 화자 힌트를 넣으려고 `participantsRef.current`를 읽는다(`useOfflineSTT.ts:96-104`). 이 용도는 살려야 한다. `getParticipants` 콜백이 있으면 그걸 우선 쓰고, 없으면 기존 `participantsRef`를 쓴다.
- `prevContextRef`는 지금 조립된 발화의 마지막 3개로 만든다. 조립이 훅 밖으로 나가면 못 만드므로, **가공 전 조각의 마지막 3개**로 대체한다. 목적(다음 청크의 화자 연속성 힌트)은 동일하다.
- `prevContextRef`는 현재 `startRecording`에서 초기화되지 않는다. 이번에 초기화를 추가한다 — 안 하면 새 녹음의 첫 청크가 이전 회의의 문맥을 프롬프트로 받는다.

- [ ] **Step 1: 타입과 ref 추가**

`src/hooks/useOfflineSTT.ts`의 `import` 아래, `type ModelStatus` 근처에 추가:

```ts
import type { RawSegment } from "@/lib/turnAssembly";

/** 청크 하나의 STT 결과를 가공 없이 내보낸다. */
export type ChunkHandler = (chunk: { segments: RawSegment[]; chunkStartMs: number }) => void;

export type RecordingHandlers = {
  onChunk: ChunkHandler;
  /** STT 프롬프트의 화자 힌트에 쓸 현재 참석자. 훅은 이 값을 보관하지 않는다. */
  getParticipants: () => Participant[];
};
```

`STTState` 인터페이스에 추가:

```ts
  recordingNoteId: string | null;
```

그리고 `startRecording`의 선언을 아래로 바꾼다:

```ts
  startRecording: (noteId?: string, handlers?: RecordingHandlers) => Promise<void>;
```

`useOfflineSTT` 본문의 ref 선언부(`const wakeLockRef = ...` 아래)에 추가:

```ts
  const [recordingNoteId, setRecordingNoteId] = useState<string | null>(null);
  const onChunkRef = useRef<ChunkHandler | null>(null);
  const getParticipantsRef = useRef<(() => Participant[]) | null>(null);
```

- [ ] **Step 2: `processChunk`가 콜백으로도 내보내게 수정**

`processChunk` 안에서 참석자를 읽는 부분을 아래로 바꾼다:

```ts
      const roster = getParticipantsRef.current?.() ?? participantsRef.current;
      if (roster.length > 0) {
        form.append("attendeeCount", String(roster.length));
        const names = roster
          .filter((p) => p.name)
          .map((p) => `화자 ${p.sp}: ${p.name}`)
          .join(", ");
        if (names) form.append("speakerNames", names);
      }
```

그리고 `setSttError(null);` 바로 다음(기존 `const newContext ...` 줄 앞)에 추가:

```ts
      // 새 경로: 가공 없이 내보낸다. 조립은 호출자가 한다.
      if (onChunkRef.current) {
        onChunkRef.current({ segments, chunkStartMs });
        // 다음 청크의 화자 연속성 힌트. 조립된 발화 대신 가공 전 조각의 마지막 3개를 쓴다.
        prevContextRef.current = segments
          .slice(-3)
          .map((s) => ({ sp: parseInt(s.clovaLabel, 10) || 1, text: s.text }));
        return;
      }
```

`return` 때문에 콜백이 등록된 경우에는 기존 `setTurns(...)` 블록이 실행되지 않는다. 콜백이 없으면(현재 `page.tsx`) 기존 경로가 그대로 돈다.

- [ ] **Step 3: `startRecording`이 새 인자를 받게 수정**

`startRecording`의 `const stream = await navigator.mediaDevices.getUserMedia(...)` **앞에** 추가:

```ts
  const startRecording = useCallback(async (noteId?: string, handlers?: RecordingHandlers) => {
    onChunkRef.current = handlers?.onChunk ?? null;
    getParticipantsRef.current = handlers?.getParticipants ?? null;
    setRecordingNoteId(noteId ?? null);
```

그리고 기존 `speakerLetterMapRef.current = new Map();` 줄 **바로 아래**에 추가:

```ts
    // 새 녹음의 첫 청크가 이전 회의의 문맥을 프롬프트로 받지 않게 한다.
    prevContextRef.current = [];
```

- [ ] **Step 4: 반환 객체에 추가**

`return {` 블록의 `isRecording,` 아래에 추가:

```ts
    recordingNoteId,
```

- [ ] **Step 5: 타입 체크와 빌드 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음. `page.tsx`는 아직 인자 없이 `startRecording()`을 호출하므로 기존 경로로 동작한다.

- [ ] **Step 6: 전체 스위트 확인**

Run: `npm test`
Expected: 126개 중 125개 통과 (변동 없음).

- [ ] **Step 7: 커밋**

```bash
git add src/hooks/useOfflineSTT.ts
git commit -m "$(cat <<'MSG'
feat(stt): 훅에 청크 콜백과 recordingNoteId 추가

기존 경로는 그대로 두고 새 API만 추가한다. 콜백이 등록되면
가공 전 조각을 내보내고 훅 내부 조립을 건너뛴다.
새 녹음 시 prevContext를 초기화해 이전 회의 문맥이 새지 않게 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: `page.tsx`가 발화를 소유하도록 이관

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `assembleTurns`, `nextSpeakerBase`, `RawSegment` (Task 1); `startRecording(noteId, handlers)`, `recordingNoteId` (Task 2)
- Produces: `handleChunk`, `applySegments`, 노트 기반 `handleEditTurn` / `handleSplitTurn` / `handleSpeakerName` — Task 5의 `AppShell` 배선이 사용한다.

이 작업이 계획의 핵심이다. 끝나면 훅의 옛 API는 아무도 쓰지 않는 상태가 된다.

**구현자가 알아야 할 것:**
- `notes`와 `currentNote`는 **같은 노트를 두 군데에 들고 있다.** 발화를 갱신할 때 둘 다 맞춰야 한다. 기존 `updateNoteState`가 그 일을 한다.
- 청크마다 `setNotes`의 이전 값을 읽어 조립하면 React 배치 때문에 경쟁이 생긴다. 그래서 **녹음 중인 노트의 발화를 ref에 들고** 그 위에 조립한 뒤 결과를 state로 밀어 넣는다.
- 녹음 중 사용자가 앞쪽 발화를 편집하면 그 편집이 ref에도 반영돼야 한다. 안 그러면 다음 청크가 편집 전 내용으로 덮어쓴다. `applySegments`가 그 일을 한다.

- [ ] **Step 1: import와 세션 ref 추가**

import 블록에 추가:

```ts
import { assembleTurns, nextSpeakerBase, type RawSegment } from "@/lib/turnAssembly";
```

`const lastSavedNote = ...`가 있던 자리 근처(상태 선언부)에 세션 ref를 추가:

```ts
  // ── 녹음 세션 상태 (녹음 1회 동안만 유효) ──
  const recordingSegmentsRef = useRef<TurnSegment[]>([]);
  const recordingParticipantsRef = useRef<Participant[]>([]);
  const sessionLetterMap = useRef<Map<string, number>>(new Map());
  const sessionSpeakerBase = useRef(1);
  const sessionBaseMs = useRef(0);
  const sessionFirstChunk = useRef(true);
```

- [ ] **Step 2: 발화 갱신 헬퍼 추가**

`updateNoteState` 함수 **아래**에 추가:

```ts
  /**
   * 특정 노트의 발화를 갱신한다. 그 노트가 지금 녹음 중이면 세션 ref도 함께 맞춘다.
   * ref를 맞추지 않으면 다음 청크가 사용자의 편집을 덮어쓴다.
   */
  function applySegments(noteId: string, segments: TurnSegment[]) {
    if (stt.recordingNoteId === noteId) {
      recordingSegmentsRef.current = segments;
    }
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, segments } : n)));
    setCurrentNote((cur) => (cur && cur.id === noteId ? { ...cur, segments } : cur));
  }

  /** 청크 하나가 도착했을 때 녹음 중인 노트에 조립해 넣는다. */
  function handleChunk(noteId: string, chunk: { segments: RawSegment[]; chunkStartMs: number }) {
    const isFirst = sessionFirstChunk.current;
    sessionFirstChunk.current = false;

    const next = assembleTurns(recordingSegmentsRef.current, chunk.segments, {
      baseMs: sessionBaseMs.current,
      chunkStartMs: chunk.chunkStartMs,
      letterMap: sessionLetterMap.current,
      speakerBase: sessionSpeakerBase.current,
      isFirstChunkOfSession: isFirst,
    });

    recordingSegmentsRef.current = next;
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, segments: next } : n)));
    setCurrentNote((cur) => (cur && cur.id === noteId ? { ...cur, segments: next } : cur));
  }

  /** 녹음 세션 ref를 노트 기준으로 초기화하고 훅을 시작한다. */
  async function beginRecording(note: NoteRecord) {
    recordingSegmentsRef.current = note.segments ?? [];
    recordingParticipantsRef.current = note.participants ?? [];
    sessionLetterMap.current = new Map();
    sessionSpeakerBase.current = nextSpeakerBase(note.segments ?? []);
    sessionBaseMs.current = note.audioDuration ?? 0;
    sessionFirstChunk.current = true;

    await stt.startRecording(note.id, {
      onChunk: (chunk) => handleChunk(note.id, chunk),
      getParticipants: () => recordingParticipantsRef.current,
    });
  }
```

- [ ] **Step 3: 편집·분할·화자 이름을 노트 기반으로 교체**

`applySegments` 아래에 추가:

```ts
  function handleEditTurn(id: number, newText: string) {
    const note = currentNote;
    if (!note) return;
    applySegments(note.id, note.segments.map((t) => (t.id === id ? { ...t, text: newText } : t)));
  }

  function handleSplitTurn(id: number, beforeText: string, afterText: string) {
    const note = currentNote;
    if (!note) return;
    const idx = note.segments.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const original = note.segments[idx];
    const newId = Math.max(0, ...note.segments.map((t) => t.id)) + 1;
    const next = [...note.segments];
    next.splice(idx, 1,
      { ...original, text: beforeText },
      { id: newId, sp: original.sp, t: original.t, text: afterText },
    );
    applySegments(note.id, next);
  }

  function handleSpeakerName(sp: number, name: string) {
    const note = currentNote;
    if (!note) return;
    const existing = note.participants.find((p) => p.sp === sp);
    const participants = existing
      ? note.participants.map((p) => (p.sp === sp ? { ...p, name, initials: name[0] ?? "" } : p))
      : [...note.participants, { sp, name, role: "", initials: name[0] ?? "" }];

    if (stt.recordingNoteId === note.id) {
      recordingParticipantsRef.current = participants;
    }
    const updated = { ...note, participants };
    updateNoteState(updated);
    dbSave(updated).catch(console.error);
  }
```

- [ ] **Step 4: 녹음 시작 경로를 `beginRecording`으로 교체**

`handleStart`에서 `stt.setParticipants(roster);`를 **삭제**하고, `await stt.startRecording();`을 `await beginRecording(note)`로 바꾼다. 로스터는 노트에만 들어간다:

```ts
  async function handleStart(roster: Participant[]) {
    const note = { ...emptyNote("live"), participants: roster };
    setCurrentNote(note);
    setKeywords([]);
    setAppMode("live");
    resetPending();
    setScreen("live");
    try {
      await beginRecording(note);
    } catch {
      alert("마이크 접근 권한이 필요합니다.");
      setScreen("roster");
    }
  }
```

`handleSkip`도 같은 모양으로 바꾼다:

```ts
  async function handleSkip() {
    const note = emptyNote("live");
    setCurrentNote(note);
    setKeywords([]);
    setAppMode("live");
    resetPending();
    setScreen("live");
    try {
      await beginRecording(note);
    } catch {
      alert("마이크 접근 권한이 필요합니다.");
      setScreen("mode-select");
    }
  }
```

- [ ] **Step 5: `handleToggleRecording` 교체**

선행 작업(Ruling 13)이 넣은 `liveNoteId` 가드와 빈 버퍼 가드를 **제거**하고 아래로 교체한다. 중지 시 저장 대상은 `currentNote`가 아니라 **녹음하던 노트**다:

```ts
  async function handleToggleRecording() {
    if (stt.isRecording) {
      const noteId = stt.recordingNoteId;
      const elapsedMs = stt.elapsedMs;
      await stt.stopRecording();
      setAppMode("review");

      const target = notes.find((n) => n.id === noteId) ?? currentNote;
      if (!target) return;
      await finalizeNote({
        ...target,
        segments: recordingSegmentsRef.current,
        participants: recordingParticipantsRef.current,
        audioDuration: sessionBaseMs.current + elapsedMs,
      });
    } else {
      const note = currentNote;
      if (!note) return;
      beginRecording(note).catch(console.error);
      setAppMode("live");
    }
  }
```

- [ ] **Step 6: `handleOpenNote`에서 `liveNoteId` 정리 제거**

선행 작업이 넣은 `liveNoteId.current = null;` 줄을 삭제한다. `setNotionStatus({ kind: "idle" })`는 그대로 둔다 — 그건 별개 목적(Ruling 9)이다. 녹음은 중지하지 않는다.

- [ ] **Step 7: `stt.turns`를 읽던 네 곳 교체**

```ts
// 1) 새 발화 배지 (기존 stt.turns.length 기반 useEffect)
  useEffect(() => {
    const len = currentNote?.segments.length ?? 0;
    const added = len - prevTurnsLen.current;
    if (added > 0) {
      prevTurnsLen.current = len;
      setPendingTurnCount((n) => n + added);
    }
  }, [currentNote?.segments.length]);

// 2) resetPending
  function resetPending() {
    setPendingTurnCount(0);
    prevTurnsLen.current = currentNote?.segments.length ?? 0;
  }

// 3) handleRegen — stt.turns 폴백 제거
    const turns = note.segments ?? [];
    const participants = note.participants ?? [];

// 4) handleExport — stt.turns 대신 노트의 발화
    const turns = currentNote.segments ?? [];
```

- [ ] **Step 8: `AppShell` props 배선 교체**

```tsx
        turns={currentNote?.segments ?? []}
        participants={currentNote?.participants ?? []}
        onSpeakerName={handleSpeakerName}
        onEditTurn={handleEditTurn}
        onSplitTurn={handleSplitTurn}
```

`canResumeRecording` prop 전달은 Task 5에서 없앤다. 이 단계에서는 그대로 둔다.

- [ ] **Step 9: 타입 체크, 린트, 빌드**

Run: `npx tsc --noEmit && npx eslint src/app/page.tsx && npm run build`
Expected: 에러 없음. `liveNoteId`가 미사용이 되면 선언도 함께 제거한다.

- [ ] **Step 10: 전체 스위트 확인**

Run: `npm test`
Expected: 126개 중 125개 통과 (변동 없음).

- [ ] **Step 11: 커밋**

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'MSG'
feat: 발화·참석자 소유권을 훅에서 노트로 이관

page.tsx가 청크를 받아 조립하고 녹음 중인 노트의 segments에 넣는다.
편집·분할·화자 이름도 노트를 직접 고쳐 사이드바에서 연 노트에서도
저장된다. 중지 시 저장 대상은 보고 있는 노트가 아니라 녹음하던 노트다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: 훅에서 옛 API 제거 (축소)

**Files:**
- Modify: `src/hooks/useOfflineSTT.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 줄어든 `STTState` — Task 5가 이 축소된 계약을 전제로 한다.

Task 3이 끝나면 아래 API는 아무도 쓰지 않는다. 남겨두면 "출처가 둘"인 상태가 되살아난다.

- [ ] **Step 1: 옛 API 제거**

`src/hooks/useOfflineSTT.ts`에서 아래를 모두 삭제한다.

인터페이스 `STTState`에서: `turns`, `participants`, `getLatestTurns`, `updateSpeakerName`, `setParticipants`, `editTurn`, `splitTurn`.

`startRecording` 선언에서 선택 표시를 없애 필수로 바꾼다:

```ts
  startRecording: (noteId: string, handlers: RecordingHandlers) => Promise<void>;
```

본문에서: `turns` state, `participants` state, `turnsRef`, `segIdRef`, `participantsRef`, 그리고 `updateSpeakerName` / `setParticipants` / `getLatestTurns` / `editTurn` / `splitTurn` 함수 전체.

`processChunk`에서 기존 `setTurns(...)` 블록과 그 뒤의 `newContext` 관련 코드를 삭제하고, Task 2에서 넣은 콜백 경로만 남긴다. 조건부 `if (onChunkRef.current)`도 없애 무조건 실행되게 한다:

```ts
      onChunkRef.current?.({ segments, chunkStartMs });
      prevContextRef.current = segments
        .slice(-3)
        .map((s) => ({ sp: parseInt(s.clovaLabel, 10) || 1, text: s.text }));
```

`roster` 폴백에서 `participantsRef`를 없앤다:

```ts
      const roster = getParticipantsRef.current?.() ?? [];
```

`startRecording`에서 인자를 필수로 받는다:

```ts
  const startRecording = useCallback(async (noteId: string, handlers: RecordingHandlers) => {
    onChunkRef.current = handlers.onChunk;
    getParticipantsRef.current = handlers.getParticipants;
    setRecordingNoteId(noteId);
```

`speakerLetterMapRef`도 삭제한다 — 문자 레이블 매핑은 `page.tsx`의 `sessionLetterMap`으로 옮겨갔다.

`return` 객체에서 삭제한 항목들을 모두 뺀다.

- [ ] **Step 2: 남아 있으면 안 되는 이름이 없는지 확인**

Run:
```bash
grep -nE "turnsRef|segIdRef|participantsRef|getLatestTurns|editTurn|splitTurn|updateSpeakerName|setParticipants|speakerLetterMapRef|setTurns" src/hooks/useOfflineSTT.ts
```
Expected: 출력 없음.

- [ ] **Step 3: 타입 체크, 린트, 빌드**

Run: `npx tsc --noEmit && npx eslint src/hooks/useOfflineSTT.ts && npm run build`
Expected: 에러 없음.

- [ ] **Step 4: 전체 스위트 확인**

Run: `npm test`
Expected: 126개 중 125개 통과 (변동 없음).

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/useOfflineSTT.ts
git commit -m "$(cat <<'MSG'
refactor(stt): 훅에서 발화·참석자 상태 제거

훅이 상태를 세션 전역으로 들고 있던 것이 연속 녹음 오염의 원인이었다.
이제 훅은 오디오와 STT 호출만 담당한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: 녹음 중 보기 전환 UI

**Files:**
- Modify: `src/components/Layout/AppShell.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `recordingNoteId` (Task 2), `handleToggleRecording` (Task 3)
- Produces: 없음 (마지막 UI 작업)

**구현자가 알아야 할 것:**
- `AppShell`의 상단바에는 이미 `mode === "live" && isRecording`일 때만 보이는 `live-pill`이 있다.
- 선행 작업이 넣은 `canResumeRecording` prop과 이어 녹음 숨김은 이제 불필요하다. 이어 녹음이 안전해졌다.

- [ ] **Step 1: `AppShell` props 교체**

`AppShellProps`에서 `canResumeRecording?: boolean;`을 삭제하고 아래를 추가한다:

```ts
  /** 지금 녹음 중인 노트. 보고 있는 노트와 다르면 상단에 안내를 띄운다. */
  recordingNoteId?: string | null;
  onGoToRecordingNote?: () => void;
```

구조 분해 목록에서도 `canResumeRecording`를 빼고 새 두 개를 넣는다(`recordingNoteId = null,`).

- [ ] **Step 2: 상단바 pill 교체**

기존 블록:

```tsx
          {mode === "live" && isRecording && (
            <div className="live-pill">
              <span className="dot" />
              REC
            </div>
          )}
```

을 아래로 바꾼다:

```tsx
          {isRecording && (
            recordingNoteId && currentNote && recordingNoteId !== currentNote.id ? (
              <button
                className="live-pill"
                onClick={onGoToRecordingNote}
                title="녹음 중인 노트로 이동"
                style={{ border: "none", cursor: "pointer" }}
              >
                <span className="dot" />
                다른 노트 녹음 중 · 돌아가기
              </button>
            ) : (
              <div className="live-pill">
                <span className="dot" />
                REC
              </div>
            )
          )}
```

- [ ] **Step 3: 이어 녹음 버튼 차단 해제**

review 배너에서 선행 작업이 넣은 `canResumeRecording &&` 조건을 없애고, 이어 녹음 버튼을 항상 렌더한다:

```tsx
                <button className="btn" onClick={onToggleRecording}>이어 녹음</button>
```

- [ ] **Step 4: `page.tsx` 배선**

`<AppShell>`에서 `canResumeRecording={...}` 줄을 삭제하고 아래를 추가한다:

```tsx
        recordingNoteId={stt.recordingNoteId}
        onGoToRecordingNote={() => { if (stt.recordingNoteId) handleOpenNote(stt.recordingNoteId); }}
```

`handleOpenNote`가 `setAppMode("review")`를 하므로, 녹음 중인 노트로 돌아갔을 때 화면이 review로 바뀐다. 녹음 중에는 live여야 하므로 `handleOpenNote`를 아래처럼 고친다:

```ts
  function handleOpenNote(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    setCurrentNote(note);
    setAppMode(stt.isRecording && stt.recordingNoteId === id ? "live" : "review");
    setScreen("live");
    setNotionStatus({ kind: "idle" });
  }
```

- [ ] **Step 5: 동시 녹음 차단**

`handleToggleRecording`의 시작 분기에 가드를 넣는다:

```ts
    } else {
      if (stt.isRecording) {
        alert("이미 다른 노트를 녹음 중입니다. 먼저 그 녹음을 종료해주세요.");
        return;
      }
      const note = currentNote;
      if (!note) return;
      beginRecording(note).catch(console.error);
      setAppMode("live");
    }
```

- [ ] **Step 6: 타입 체크, 린트, 빌드**

Run: `npx tsc --noEmit && npx eslint src/app/page.tsx src/components/Layout/AppShell.tsx && npm run build`
Expected: 에러 없음.

- [ ] **Step 7: 전체 스위트 확인**

Run: `npm test`
Expected: 126개 중 125개 통과.

- [ ] **Step 8: 커밋**

```bash
git add src/app/page.tsx src/components/Layout/AppShell.tsx
git commit -m "$(cat <<'MSG'
feat(ui): 녹음 중 보기 전환 안내와 이어 녹음 차단 해제

다른 노트를 보는 중이면 상단에 "다른 노트 녹음 중 · 돌아가기"를 띄운다.
발화 버퍼가 노트별로 분리돼 이어 녹음이 안전해졌으므로 임시 차단을 푼다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: 수동 검증

**Files:**
- 없음 (코드 변경 없음)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음

마이크·MediaRecorder·워치독·Wake Lock은 단위 테스트가 닿지 않는다. 이 작업의 실질적 위험이 여기 있다. 각 항목의 결과를 보고한다.

- [ ] **Step 1: 연속 2회 녹음 (이 계획의 핵심 검증)**

`npm run dev` 실행 후:
1. 라이브 모드로 회의 A를 30초 녹음 → 중지
2. 새로고침 **없이** "새 노트" → 라이브 → 회의 B를 20초 녹음 → 중지
3. 회의 B의 트랜스크립트에 회의 A의 발화가 **하나도 없어야 한다**

Expected: B에는 B의 발화만 있다. (수정 전에는 A 전체 + B가 나왔다)

- [ ] **Step 2: 이어 녹음**

1. Step 1에서 저장한 회의 B를 사이드바에서 연다
2. "이어 녹음"을 눌러 15초 더 녹음 → 중지

Expected: 새 발화의 시각이 기존 발화 뒤로 이어진다(`00:00`으로 돌아가지 않는다). 새 화자 번호가 기존 최대값 다음부터 붙는다.

- [ ] **Step 3: 녹음 중 보기 전환**

1. 회의 C 녹음을 시작한다
2. 녹음 중에 사이드바에서 회의 A를 클릭한다
3. 상단에 `● 다른 노트 녹음 중 · 돌아가기`가 보이는지 확인
4. 그 버튼을 눌러 회의 C로 돌아간다

Expected: 녹음이 끊기지 않고, 돌아갔을 때 그동안의 발화가 쌓여 있다. 회의 A에는 아무것도 추가되지 않았다.

- [ ] **Step 4: 다른 노트를 보는 상태에서 중지**

1. 회의 D 녹음 중에 사이드바에서 회의 A를 연다
2. 그 상태에서 녹음을 중지한다

Expected: 회의 D가 저장된다(Notion 포함). 회의 A는 변하지 않았다.

- [ ] **Step 5: 옛 노트 편집과 내보내기**

1. 사이드바에서 회의 A를 연다
2. 발화 하나의 텍스트를 고치고, 화자 이름을 바꾼다
3. 다른 노트로 갔다가 다시 회의 A를 연다
4. 회의 A를 PDF로 내보낸다

Expected: 편집과 화자 이름이 유지된다. PDF에 회의 A의 트랜스크립트가 나온다(다른 회의 것이 아니라).

- [ ] **Step 6: 동시 녹음 차단**

1. 회의 E 녹음 중에 다른 노트를 열고 "이어 녹음"을 누른다

Expected: "이미 다른 노트를 녹음 중입니다" 안내가 뜨고 새 녹음이 시작되지 않는다.

- [ ] **Step 7: 장시간 녹음**

15분 이상 연속 녹음한다.

Expected: 워치독이 동작해 녹음이 끊기지 않고, 15초 청크가 계속 들어온다.

- [ ] **Step 8: 결과 보고**

각 항목의 통과/실패를 보고한다. 실패가 있으면 재현 절차와 함께 보고한다. **코드를 고치지 않는다** — 수정 여부는 별도 판단한다.

---

## 자체 검토 결과

**스펙 커버리지:** §2 경계/훅 인터페이스 → Task 2·4, §3 타임스탬프 오프셋 → Task 1(`baseMs`)·Task 3(`sessionBaseMs`), §4 화자 번호 → Task 1(`speakerBase`)·Task 3(`nextSpeakerBase`), §5 보기 전환 → Task 5, §6 조립 규칙 → Task 1, §7 편집·분할·화자 이름 → Task 3, §8 테스트 → Task 1·6. 빠진 요구사항 없음.

**스펙이 침묵했던 두 곳, 계획에서 결정함:**
1. `processChunk`가 STT 프롬프트의 화자 힌트로 `participantsRef`를 쓴다(`useOfflineSTT.ts:96-104`). 스펙은 훅에서 `participants`를 없애라고만 했다. → 훅이 상태를 보관하지 않되 `getParticipants` 콜백으로 현재 로스터를 읽는다.
2. `prevContextRef`는 조립된 발화의 마지막 3개로 만들어진다. 조립이 훅 밖으로 나가면 못 만든다. → 가공 전 조각의 마지막 3개로 대체한다. 목적(다음 청크 화자 연속성 힌트)은 같다. 아울러 `startRecording`에서 초기화를 추가한다 — 현재는 초기화되지 않아 새 녹음의 첫 청크가 이전 회의 문맥을 프롬프트로 받는다.

**타입 일관성:** `assembleTurns`는 Task 1에서 `TurnSegment[]`를 반환하며(`nextId`를 반환하지 않는다) Task 3이 그 시그니처로 호출한다. `startRecording`은 Task 2에서 선택 인자, Task 4에서 필수로 좁혀지며 Task 3이 그 사이에 두 인자를 모두 넘긴다.
