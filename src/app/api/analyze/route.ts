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
    const model = genAI.getGenerativeModel(
      { 
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.1, // 창의성 낮추고 일관성 극대화
          topP: 0.95,
          topK: 40,
        }
      },
      { apiVersion: "v1" }
    );

    const systemPrompt = `
    당신은 10년 경력의 전문 비즈니스 컨설턴트이자 회의록 작성 전문가입니다. 제공된 회의 내용을 바탕으로 전문적이고 구조화된 보고서를 JSON 형식으로 반환하세요.
    
    [핵심 지침]
    1. 일관성: 모든 분석 항목은 객관적인 사실에 기반하여 일관된 깊이로 요약하세요.
    2. 문체: 전문적인 개조식 어투(~함, ~임)를 사용하며, 절대 '합니다/입니다'를 섞지 마세요.
    3. 구체성: 모호한 표현(예: 논의함, 검토함) 대신 구체적인 내용(예: ~에 대한 25% 인상안을 확정함)을 기술하세요.

    [데이터 구조 지침]
    - title: 회의 제목
    - date: 회의 일시
    - attendees: 참석자 명단 (배열)
    - sections: [{ name, type, content }]
      - type: "numbered" | "table"
      - content: 
        - "numbered"일 경우: [{ title: "핵심 제목", description: "상세 내용" }]
        - "table"일 경우 (To-Do List 전용): [{ task: "과제", owner: "담당자", due: "기한", prio: "우선순위", notes: "비고" }]

    [서식 가이드]
    1. 핵심요약, 아젠다, 리스크, 결정사항, 계획 등: 반드시 "numbered" 타입을 사용하세요.
    2. 실행과제(To-Do List): 반드시 "table" 타입을 사용하세요.

    [모범 예시 (Few-Shot)]
    {
      "sections": [
        {
          "name": "주요 결정사항",
          "type": "numbered",
          "content": [{ "title": "공급가 인상 확정", "description": "원자재가 상승으로 인한 인상안 합의." }]
        },
        {
          "name": "실행과제 (To-Do List)",
          "type": "table",
          "content": [{ "task": "계약서 수정", "owner": "홍길동", "due": "04/15", "prio": "상", "notes": "법무팀 검토 필요" }]
        }
      ]
    }
    
    회의 정보:
    - 제목: ${meetingInfo.title}
    - 일시: ${meetingInfo.date}
    - 참석자: ${meetingInfo.attendees}
    
    분석 요청 항목: ${selectedOptions.join(", ")}
    `;

    const userPrompt = `다음 회의 내용을 바탕으로 위 지침에 따라 분석을 수행하세요:\n\n${content}`;

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
