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
          { 
            "name": "항목명 (예: 핵심요약, 참석자 분석, 아젠다별 주요 내용, TO-DO-LIST 등)", 
            "type": "text | list | table | numbered",
            "content": "타입에 따른 내용" 
          }
        ]
      }

      타입별 가이드:
      - "text": 긴 줄글 설명.
      - "list": 단순 글머리 기호 리스트 (string[]).
      - "numbered": (아젠다별 주요 내용, 미결정사항, 리스크/이슈 전용) 각 항목은 { "title": "항목 제목", "description": "상세 내용" } 객체의 배열.
      - "table": (TO-DO-LIST 전용) 각 항목은 { "task": "실행과제", "owner": "담당자", "due": "기한", "prio": "우선순위", "notes": "비고" } 객체의 배열.
      
      중요 문체 및 형식 지침: 
      1. 문체: 절대로 "~합니다", "~이었습니다" 등의 존댓말이나 서술형 문장을 사용하지 마십시오. 반드시 "**~하기로 함**", "**~을 확인함**", "**~될 예정임**", "**~할 계획임**"과 같은 **간결한 개조식/명사형 어투**를 사용하십시오.
      2. '아젠다별 주요 내용', '미결정사항', '리스크/이슈'는 위 "numbered" 타입을 사용하여 제목과 내용을 분리하십시오.
      3. 'TO-DO-LIST'는 반드시 "table" 타입을 사용하여 표 형식 데이터를 생성하십시오.
      4. 모든 회의록은 비즈니스 환경에 적합한 전문적인 용어를 사용하십시오.
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
