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

// 일본어 히라가나/가타카나만 있고 한국어·영어가 전혀 없으면 hallucination으로 간주
function isJapaneseHallucination(text: string): boolean {
  const hasJapanese = /[぀-ヿ]/.test(text);
  const hasKorean = /[가-힣ᄀ-ᇿ㄰-㆏]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  return hasJapanese && !hasKorean && !hasLatin;
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
    // language 파라미터는 diarize 모델에서 silently 무시되어 자동 감지로 전환됨
    // → 짧은 한국어 클립을 일본어로 오감지하는 원인. 제거 후 자동 감지가 더 안정적.

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
        if (isJapaneseHallucination(text)) {
          console.warn("[stt-openai] 일본어 hallucination 제거:", text.slice(0, 60));
          continue;
        }
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
    // 진단용: 실제 응답 구조 노출 (화자구분 디버깅)
    const debugKeys = Object.keys(data);
    const debugFirst = Array.isArray(data.segments) ? JSON.stringify(data.segments[0]).slice(0, 200) : "no segments";
    console.log("[stt-openai] response keys:", debugKeys, "first segment:", debugFirst);
    const payload: ApiSttResponse & { _debug?: unknown } = {
      segments,
      text,
      _debug: { keys: debugKeys, firstSegment: data.segments?.[0] ?? null },
    };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
