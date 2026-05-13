import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 120;

type ApiSegment = {
  clovaLabel: string;
  text: string;
  start?: number;
  end?: number;
};

type ApiSttResponse = {
  segments: ApiSegment[];
  text: string;
};

const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const CHUNK_DURATION_S = 20;

// 20초 청크에서 한국어 평균 발화 속도 기준 최대 글자 수 (넉넉하게 2배)
// 한국어 평균: ~4글자/초 × 20초 × 2 = 160글자. 토큰으로 약 320.
const MAX_TOKENS_PER_CHUNK = 400;

// 시스템 지침: 절대 원칙으로 분리
const SYSTEM_INSTRUCTION = `당신은 오디오 STT(음성→텍스트) 전사 전문가입니다.

절대 원칙 — 어떠한 상황에서도 반드시 지킵니다:
1. 오디오에서 실제로 명확하게 들리는 발화만 전사합니다.
2. 조금이라도 불명확하거나 확신할 수 없는 내용은 절대 추측하지 않습니다.
3. 잘 들리지 않는 단어나 구간은 [못들음]으로 표시합니다. 절대 내용을 추정하거나 보완하지 않습니다.
4. 침묵, 배경소음, 잡음, 기침, 웃음 등 비발화는 무시합니다.
5. 오디오가 끝나는 즉시 전사를 멈춥니다. 내용을 이어 붙이지 않습니다.
6. 오디오에 발화가 전혀 없으면 반드시 "SILENCE" 한 단어만 출력합니다.
7. 맥락으로 단어를 유추하거나 문장을 완성하지 않습니다. 들은 것만 씁니다.`;

function buildUserPrompt(
  attendeeCount?: number,
  speakerNames?: string,
  prevContext?: { sp: number; text: string }[],
): string {
  const countHint = attendeeCount && attendeeCount > 0
    ? `\n참고: 이 오디오에는 약 ${attendeeCount}명의 화자가 있습니다.`
    : "";

  const nameHint = speakerNames
    ? `\n참고: 참여자 이름 — ${speakerNames}`
    : "";

  const contextHint = prevContext && prevContext.length > 0
    ? `\n[직전 대화 — 화자 번호 파악용. 이 내용은 절대 다시 출력하지 마세요]\n${prevContext.map((t) => `[화자 ${t.sp}] ${t.text}`).join("\n")}\n[직전 대화 끝]`
    : "";

  return `위 오디오 클립(약 ${Math.round(CHUNK_DURATION_S)}초)을 전사하세요.${countHint}${nameHint}${contextHint}

출력 규칙:
- 발화가 있으면: [화자 1] 내용 / [화자 2] 내용 (화자별 한 줄)
- 잘 안 들리는 부분: 해당 위치에 [못들음] 삽입. 절대 추측 금지
- 발화가 없으면: SILENCE
- 다른 설명, 주석, 메타 텍스트 절대 출력 금지`;
}

// 환각 판정 패턴 — 이 문자열이 나오면 Gemini가 프롬프트를 반복하거나 만들어낸 것
const HALLUCINATION_PATTERNS = [
  /오디오 클립을 전사하세요/,
  /절대 원칙/,
  /출력 규칙/,
  /참고:/,
  /직전 대화/,
  /화자를 분리해주세요/,
  /00:\d{2}:\d{2}/,           // 타임스탬프 형식
  /\d{2}:\d{2}\.\d{3}/,       // 밀리초 타임스탬프
  /음성→텍스트/,
];

// 한 세그먼트가 한국어 기준으로 너무 길면 환각으로 판단
// 20초 청크에서 한 화자가 160글자 이상 말하기는 매우 드뭄
const MAX_SEGMENT_CHARS = 200;

function isHallucinated(text: string): boolean {
  if (text.length > MAX_SEGMENT_CHARS) return true;
  return HALLUCINATION_PATTERNS.some((p) => p.test(text));
}

function parseGeminiOutput(raw: string): ApiSegment[] {
  const trimmed = raw.trim();

  // SILENCE 또는 완전히 비어있으면 빈 배열
  if (!trimmed || trimmed === "SILENCE" || /^silence$/i.test(trimmed)) {
    return [];
  }

  const segments: ApiSegment[] = [];

  for (const line of trimmed.split("\n")) {
    const m = line.trim().match(/^\[화자\s*(\w+)\]\s*(.+)$/);
    if (!m) continue;

    const text = m[2].trim();
    if (isHallucinated(text)) {
      console.warn("[stt-gemini] 환각 제거:", text.slice(0, 80));
      continue;
    }

    segments.push({ clovaLabel: m[1], text });

    // 루프 탐지: 동일 패턴이 3회 이상 반복되면 중단
    const n = segments.length;
    let loopDetected = false;
    for (let period = 1; period <= 8; period++) {
      if (n < period * 3) continue;
      const a = segments.slice(n - period * 2, n - period).map(s => s.text);
      const b = segments.slice(n - period).map(s => s.text);
      if (a.every((t, i) => t === b[i])) {
        segments.splice(n - period * 2);
        loopDetected = true;
        break;
      }
    }
    if (loopDetected) break;
  }

  // 연속 중복 제거
  return segments.filter((seg, i) =>
    i === 0 || seg.text !== segments[i - 1].text
  );
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("media") as Blob | null;
    if (!file) {
      return NextResponse.json({ error: "Missing 'media' file" }, { status: 400 });
    }

    const apiKey = req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API Key가 없습니다." }, { status: 401 });
    }

    const attendeeCountRaw = formData.get("attendeeCount") as string | null;
    const attendeeCount = attendeeCountRaw ? parseInt(attendeeCountRaw, 10) : undefined;
    const speakerNames = formData.get("speakerNames") as string | null ?? undefined;
    const prevContextRaw = formData.get("prevContext") as string | null;
    const prevContext = prevContextRaw
      ? (JSON.parse(prevContextRaw) as { sp: number; text: string }[])
      : undefined;

    const userPrompt = buildUserPrompt(attendeeCount, speakerNames, prevContext);

    const rawMime = file.type || "audio/webm";
    const mimeType = rawMime.split(";")[0].trim();

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const genAI = new GoogleGenerativeAI(apiKey);

    let segments: ApiSegment[] | null = null;
    let lastError = "";

    for (const modelName of MODEL_CHAIN) {
      try {
        const model = genAI.getGenerativeModel(
          {
            model: modelName,
            systemInstruction: SYSTEM_INSTRUCTION,
            generationConfig: {
              temperature: 0,
              maxOutputTokens: MAX_TOKENS_PER_CHUNK,
            },
          },
          { apiVersion: "v1beta" }
        );
        const result = await model.generateContent([
          { inlineData: { mimeType, data: base64 } },
          userPrompt,
        ]);
        const raw = result.response.text();
        console.log(`[stt-gemini] ${modelName} 원본 출력 (첫 120자):`, raw.slice(0, 120));
        segments = parseGeminiOutput(raw);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "unknown";
        console.error(`[stt-gemini] ${modelName} 실패:`, lastError.slice(0, 120));
      }
    }

    if (segments === null) {
      return NextResponse.json({ error: lastError }, { status: 503 });
    }

    // prevContext에 이미 있는 텍스트 제거 (Gemini가 직전 대화를 복사하는 현상 방지)
    if (prevContext && prevContext.length > 0) {
      const prevTexts = new Set(prevContext.map((t) => t.text.trim()));
      segments = segments.filter((s) => !prevTexts.has(s.text.trim()));
    }

    // 발화 없음 → 빈 배열로 반환 (프론트에서 처리)
    const text = segments.map((s) => `[화자 ${s.clovaLabel}] ${s.text}`).join("\n");
    const payload: ApiSttResponse = { segments, text };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
