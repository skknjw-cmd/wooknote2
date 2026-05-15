import { NextRequest, NextResponse } from "next/server";

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

// diarized_json 응답에서 화자 ID를 1-based 숫자 레이블로 변환
function speakerToLabel(speakerId: string, map: Map<string, string>): string {
  if (!map.has(speakerId)) {
    map.set(speakerId, String(map.size + 1));
  }
  return map.get(speakerId)!;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("media") as Blob | null;
    if (!file) {
      return NextResponse.json({ error: "Missing 'media' file" }, { status: 400 });
    }

    const apiKey = req.headers.get("x-openai-key") || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API Key가 없습니다." }, { status: 401 });
    }

    const openAiForm = new FormData();
    openAiForm.append("file", file, "chunk.wav");
    openAiForm.append("model", "gpt-4o-transcribe-diarize");
    openAiForm.append("response_format", "diarized_json");
    openAiForm.append("language", "ko");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: openAiForm,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[stt-openai] API 오류:", errText.slice(0, 200));
      return NextResponse.json({ error: errText }, { status: response.status });
    }

    const data = await response.json();
    const speakerMap = new Map<string, string>();
    const segments: ApiSegment[] = [];

    // diarized_json 형식: { segments: [{ text, speaker, start, end }] }
    if (Array.isArray(data.segments)) {
      for (const seg of data.segments) {
        const text = String(seg.text ?? "").trim();
        if (!text || text === "SILENCE") continue;
        const label = speakerToLabel(String(seg.speaker ?? "SPEAKER_0"), speakerMap);
        segments.push({
          clovaLabel: label,
          text,
          start: typeof seg.start === "number" ? seg.start : undefined,
          end: typeof seg.end === "number" ? seg.end : undefined,
        });
      }
    } else if (data.text) {
      segments.push({ clovaLabel: "1", text: String(data.text).trim() });
    }

    const text = segments.map((s) => `[화자 ${s.clovaLabel}] ${s.text}`).join("\n");
    const payload: ApiSttResponse = { segments, text };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
