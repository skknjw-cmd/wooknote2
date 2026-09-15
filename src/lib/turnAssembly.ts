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
