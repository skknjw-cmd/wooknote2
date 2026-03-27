import { NextRequest, NextResponse } from "next/server";

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
    // data.text 
    return NextResponse.json({ text: data.text });
  } catch (error: any) {
    console.error("STT Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
