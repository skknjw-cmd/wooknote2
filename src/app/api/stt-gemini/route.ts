import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

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
const CHUNK_DURATION_S = 20; // useOfflineSTT.ts의 CHUNK_MS와 동기화

function buildPrompt(
  attendeeCount?: number,
  speakerNames?: string,
  prevContext?: { sp: number; text: string }[],
): string {
  const countHint = attendeeCount && attendeeCount > 0
    ? `\n이 오디오에는 약 ${attendeeCount}명의 화자가 있습니다.`
    : "";

  const nameHint = speakerNames
    ? `\n참여자 정보: ${speakerNames}`
    : "";

  const contextHint = prevContext && prevContext.length > 0
    ? `\n[직전 대화 — 화자 번호 참고용. 이 내용은 출력에 절대 포함하지 마세요]\n${prevContext.map((t) => `[화자 ${t.sp}] ${t.text}`).join("\n")}\n[직전 대화 끝]\n`
    : "";

  const durationHint = `\n이 오디오 클립은 약 ${Math.round(CHUNK_DURATION_S)}초 분량입니다. 그 이상의 내용은 절대 생성하지 마세요.`;

  return `다음 회의 오디오 클립을 한국어로 전사하고 화자를 분리해주세요.${countHint}${nameHint}${durationHint}${contextHint}

엄격한 규칙:
1. 오디오에서 실제로 들리는 발화만 전사하세요. 들리지 않는 내용은 절대 추가하지 마세요.
2. 오디오가 끝나면 즉시 전사를 멈추세요. 내용을 이어서 만들어내지 마세요.
3. 각 발화를 [화자 1], [화자 2] 형식으로 레이블링하세요.
4. 직전 대화가 제공된 경우 동일한 화자 번호를 그대로 이어서 사용하세요.
5. 화자를 구분할 때 목소리 높낮이, 말투, 억양 차이를 최대한 활용하세요.
6. 화자가 한 명뿐이더라도 반드시 [화자 1] 레이블을 붙이세요.
7. 같은 화자가 연속으로 말하면 하나로 묶으세요.
8. 같은 문장을 두 번 이상 쓰지 마세요.
9. 침묵이나 잡음은 무시하세요.
10. 직전 대화에 나온 문장을 절대 다시 쓰지 마세요. 이 오디오에서 새로 들리는 내용만 출력하세요.

출력 형식 (다른 설명 없이 아래 형식만):
[화자 1] 발화 내용
[화자 2] 발화 내용`;
}

// Gemini가 오디오 인식 실패 시 프롬프트·타임스탬프를 반복 출력하는 환각 패턴
const HALLUCINATION_PATTERNS = [
  /다음 회의 오디오 클립을/,
  /이 오디오 클립은 약\s*\d+초/,
  /화자를 분리해주세요/,
  /출력 형식 \(다른 설명/,
  /엄격한 규칙:/,
  /00:\d{2}:\d{2}\.\d{3}/,  // 오디오 플레이어 타임스탬프 형식
];

function isHallucinatedText(text: string): boolean {
  if (text.length > 250) return true;
  return HALLUCINATION_PATTERNS.some((p) => p.test(text));
}

function parseGeminiOutput(raw: string): ApiSegment[] {
  const segments: ApiSegment[] = [];
  for (const line of raw.split("\n")) {
    const m = line.trim().match(/^\[화자\s*(\w+)\]\s*(.+)$/);
    if (!m) continue;
    const text = m[2].trim();
    if (isHallucinatedText(text)) {
      console.warn("[stt-gemini] 환각 세그먼트 제거:", text.slice(0, 60));
      continue;
    }
    segments.push({ clovaLabel: m[1], text });

    // 루프 탐지: period 1~12 사이클 반복 검사
    const n = segments.length;
    let loopDetected = false;
    for (let period = 1; period <= 12; period++) {
      if (n < period * 3) continue; // 최소 3사이클은 봐야 확실
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

  // 연속 중복 제거: 바로 앞 세그먼트와 텍스트가 같으면 스킵
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
    const prompt = buildPrompt(attendeeCount, speakerNames, prevContext);

    // Gemini는 codecs 파라미터를 거부하므로 base MIME type만 추출
    const rawMime = file.type || "audio/webm";
    const mimeType = rawMime.split(";")[0].trim() as string;

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const genAI = new GoogleGenerativeAI(apiKey);

    let segments: ApiSegment[] | null = null;
    let lastError = "";

    for (const modelName of MODEL_CHAIN) {
      try {
        const model = genAI.getGenerativeModel(
          { model: modelName, generationConfig: { temperature: 0, maxOutputTokens: 1200 } },
          { apiVersion: "v1" }
        );
        const result = await model.generateContent([
          { inlineData: { mimeType, data: base64 } },
          prompt,
        ]);
        const raw = result.response.text();
        segments = parseGeminiOutput(raw);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "unknown";
        console.error(`[stt-gemini] ${modelName} 실패:`, lastError.slice(0, 120));
      }
    }

    if (!segments) {
      return NextResponse.json({ error: lastError }, { status: 503 });
    }

    // prevContext와 일치하는 세그먼트 제거 (Gemini가 직전 대화를 복사하는 현상 방지)
    if (prevContext && prevContext.length > 0) {
      const prevTexts = new Set(prevContext.map((t) => t.text.trim()));
      segments = segments.filter((s) => !prevTexts.has(s.text.trim()));
    }

    if (segments.length === 0) {
      segments = [{ clovaLabel: "1", text: "(음성 없음 또는 인식 불가)" }];
    }

    const text = segments.map((s) => `[화자 ${s.clovaLabel}] ${s.text}`).join("\n");
    const payload: ApiSttResponse = { segments, text };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
