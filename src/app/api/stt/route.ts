import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Vercel 함수 최대 실행 시간 (초)

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("media") as Blob | null;

    if (!file) {
      return NextResponse.json({ error: "Missing 'media' file" }, { status: 400 });
    }

    const invokeUrl = req.headers.get("x-clova-url") || process.env.CLOVA_SPEECH_INVOKE_URL;
    const secretKey = req.headers.get("x-clova-key") || process.env.CLOVA_SPEECH_SECRET_KEY;

    if (!invokeUrl || !secretKey) {
      return NextResponse.json(
        { error: "API 자격 증명이 설정되지 않았습니다. 우측 상단 설정을 확인해주세요." },
        { status: 401 }
      );
    }

    // Prepare exactly what Clova Speech /recognizer/upload API expects
    const clovaFormData = new FormData();
    clovaFormData.append("media", file, "audio.webm");
    
    // Required params for Clova Speech
    const params = {
      language: "ko-KR",
      completion: "sync",
      diarization: {
        enable: true,
        speakerCountMin: 1,
        speakerCountMax: 10,
      }
    };
    clovaFormData.append("params", JSON.stringify(params));

    const response = await fetch(`${invokeUrl}/recognizer/upload`, {
      method: "POST",
      headers: {
        "X-CLOVASPEECH-API-KEY": secretKey,
      },
      body: clovaFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Clova Speech API Error:", errText);
      return NextResponse.json({ error: "Failed to process STT", details: errText }, { status: response.status });
    }

    const data = await response.json();
    console.log("[STT Server] Clova 응답:", JSON.stringify(data).slice(0, 500));

    // Clova가 HTTP 200이지만 result:"FAILED"를 반환하는 경우 처리
    if (data.result === "FAILED") {
      return NextResponse.json(
        { error: "STT 변환 실패", details: data.message || "알 수 없는 오류" },
        { status: 422 }
      );
    }

    // 화자 분리 정보가 있는 경우 세그먼트별로 포맷팅
    if (data.segments && data.segments.length > 0) {
      const formattedText = data.segments
        .map((s: any) => `[화자 ${s.speaker?.label || s.speaker?.name || "알수없음"}] ${s.text}`)
        .join("\n");
      return NextResponse.json({ text: formattedText });
    }

    // 세그먼트가 없는 경우 기본 텍스트 반환
    return NextResponse.json({ text: data.text });
  } catch (error: any) {
    console.error("STT Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
