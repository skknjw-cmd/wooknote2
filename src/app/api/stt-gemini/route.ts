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

function buildPrompt(attendeeCount?: number): string {
  const countHint = attendeeCount && attendeeCount > 0
    ? `\n이 오디오에는 약 ${attendeeCount}명의 화자가 있습니다.`
    : "";
  return `다음 회의 오디오를 한국어로 전사하고 화자를 분리해주세요.${countHint}

규칙:
1. 각 발화를 [화자 1], [화자 2] 형식으로 레이블링하세요.
2. 화자가 한 명뿐이더라도 반드시 [화자 1] 레이블을 붙이세요.
3. 같은 화자가 연속으로 말하면 하나로 묶으세요.
4. 두 명이 동시에 말하는 경우 각각 별도 줄에 표시하세요.
5. 발화 내용을 정확히 전사하세요. 반복 없이 딱 한 번만 적으세요.
6. 침묵이나 잡음은 무시하세요.

출력 형식 (다른 설명 없이 아래 형식만):
[화자 1] 발화 내용
[화자 2] 발화 내용`;
}

function parseGeminiOutput(raw: string): ApiSegment[] {
  const segments: ApiSegment[] = [];
  for (const line of raw.split("\n")) {
    const m = line.trim().match(/^\[화자\s*(\w+)\]\s*(.+)$/);
    if (!m) continue;
    segments.push({ clovaLabel: m[1], text: m[2].trim() });

    // Detect period-1 or period-2 cycle in the last 6 segments.
    // e.g. "네/네/네/네/네/네" or "네/아/네/아/네/아"
    const n = segments.length;
    if (n >= 6) {
      const tail = segments.slice(-6);
      const evenTexts = new Set(tail.filter((_, i) => i % 2 === 0).map(s => s.text));
      const oddTexts  = new Set(tail.filter((_, i) => i % 2 === 1).map(s => s.text));
      if (evenTexts.size === 1 && oddTexts.size === 1) {
        segments.splice(n - 6); // drop the looping tail entirely
        break;
      }
    }
  }
  return segments;
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

    const attendeeCountRaw = req.headers.get("x-attendee-count");
    const attendeeCount = attendeeCountRaw ? parseInt(attendeeCountRaw, 10) : undefined;
    const prompt = buildPrompt(attendeeCount);

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
          { model: modelName, generationConfig: { temperature: 0.1, maxOutputTokens: 1024 } },
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
