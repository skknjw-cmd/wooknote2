import { NextRequest, NextResponse } from "next/server";

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("media") as Blob | null;

    if (!file) {
      return NextResponse.json(
        { error: "Missing 'media' file" },
        { status: 400 }
      );
    }

    const invokeUrl =
      req.headers.get("x-clova-url") || process.env.CLOVA_SPEECH_INVOKE_URL;
    const secretKey =
      req.headers.get("x-clova-key") || process.env.CLOVA_SPEECH_SECRET_KEY;

    if (!invokeUrl || !secretKey) {
      return NextResponse.json(
        {
          error:
            "API 자격 증명이 설정되지 않았습니다. 우측 상단 설정을 확인해주세요.",
        },
        { status: 401 }
      );
    }

    const clovaFormData = new FormData();
    clovaFormData.append("media", file, "audio.webm");
    const attendeeCountRaw = req.headers.get("x-attendee-count");
    const attendeeCount = parseInt(attendeeCountRaw ?? "", 10);
    const speakerCountMax =
      Number.isFinite(attendeeCount) && attendeeCount > 0
        ? attendeeCount + 1
        : 10;

    const params = {
      language: "ko-KR",
      completion: "sync",
      diarization: {
        enable: true,
        speakerCountMin: 1,
        speakerCountMax,
      },
    };
    clovaFormData.append("params", JSON.stringify(params));

    const response = await fetch(`${invokeUrl}/recognizer/upload`, {
      method: "POST",
      headers: { "X-CLOVASPEECH-API-KEY": secretKey },
      body: clovaFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Clova Speech API Error:", errText);
      return NextResponse.json(
        { error: "Failed to process STT", details: errText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.result === "FAILED") {
      return NextResponse.json(
        { error: "STT 변환 실패", details: data.message || "알 수 없는 오류" },
        { status: 422 }
      );
    }

    const segments: ApiSegment[] = [];
    if (Array.isArray(data.segments) && data.segments.length > 0) {
      for (const s of data.segments) {
        const label =
          s?.speaker?.label ?? s?.speaker?.name ?? "1";
        segments.push({
          clovaLabel: String(label),
          text: String(s?.text ?? ""),
          start: typeof s?.start === "number" ? s.start : undefined,
          end: typeof s?.end === "number" ? s.end : undefined,
        });
      }
    } else if (data.text) {
      segments.push({ clovaLabel: "1", text: String(data.text) });
    }

    const text = segments
      .map((s) => `[화자 ${s.clovaLabel}] ${s.text}`)
      .join("\n");

    const payload: ApiSttResponse = { segments, text };
    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("STT Route Error:", error);
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
