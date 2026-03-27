import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { meetingInfo, selectedOptions, content } = await req.json();

    const apiKey = req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API Key missing. 우측 상단 설정을 확인해주세요." }, { status: 401 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as it is the available model for this API key
    const model = genAI.getGenerativeModel(
      { model: "gemini-2.5-flash" },
      { apiVersion: "v1" }
    );

    const systemPrompt = `
      당신은 전문적인 회의록 작성 전문가입니다. 
      제공된 회의 내용(텍스트)을 분석하여 아래 요청된 항목들에 대해 정형화된 한국어 회의록을 작성해주세요.
      
      회의 제목: ${meetingInfo.title}
      일시: ${meetingInfo.date}
      장소: ${meetingInfo.location}
      참석자: ${meetingInfo.attendees}

      분석 요청 항목: ${selectedOptions.join(", ")}

      응답 형식은 반드시 아래와 같은 JSON 구조여야 합니다:
      {
        "title": "회의 제목",
        "date": "회의 일시",
        "location": "회의 장소",
        "attendees": ["참석자1", "참석자2", ...],
        "sections": [
          { "name": "항목명", "content": "분석 내용 (string 또는 string[])" }
        ]
      }
      
      각 항목별로 내용이 풍부하고 정확하게 작성되어야 합니다.
    `;

    const userPrompt = `다음은 회의 원문 내용입니다:\n\n${content}`;

    const result = await model.generateContent([systemPrompt, userPrompt]);
    const responseText = result.response.text();
    
    try {
      // Direct parse since we used responseMimeType
      const analysisResult = JSON.parse(responseText);
      return NextResponse.json(analysisResult);
    } catch (parseError) {
      console.error("Gemini JSON Parse Error, trying fallback:", parseError);
      // Fallback: extract JSON with regex
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysisResult = JSON.parse(jsonMatch[0]);
        return NextResponse.json(analysisResult);
      }
      throw new Error("AI 응답을 처리하는 중 오류가 발생했습니다 (Invalid JSON).");
    }
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
