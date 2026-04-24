import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

// Primary → fallback chain. Tried in order when the primary is overloaded.
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

// Retry delays in ms. Three attempts per model.
const RETRY_DELAYS_MS = [0, 2000, 5000];

// HTTP status codes that are worth retrying (transient).
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const id = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new Error("aborted"));
      },
      { once: true }
    );
  });

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Google SDK surfaces status codes inside the error message text.
  for (const code of TRANSIENT_STATUS) {
    if (msg.includes(`[${code} `) || msg.includes(` ${code} `)) return true;
  }
  // Common transient phrases
  if (/high demand|overloaded|temporarily|try again later/i.test(msg)) {
    return true;
  }
  return false;
}

async function callGemini(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel(
    {
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        topK: 40,
      },
    },
    { apiVersion: "v1" }
  );

  if (signal.aborted) throw new Error("aborted");

  const result = await model.generateContent([systemPrompt, userPrompt]);
  return result.response.text();
}

export async function POST(req: NextRequest) {
  try {
    const { meetingInfo, selectedOptions, content } = await req.json();

    const apiKey =
      req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Gemini API Key missing. 우측 상단 설정을 확인해주세요.",
        },
        { status: 401 }
      );
    }

    const systemPrompt = `
    당신은 10년 경력의 전문 비즈니스 컨설턴트이자 회의록 작성 전문가입니다. 제공된 회의 내용을 바탕으로 전문적이고 구조화된 보고서를 JSON 형식으로 반환하세요.

    [핵심 지침]
    1. 일관성: 모든 분석 항목은 객관적인 사실에 기반하여 일관된 깊이로 요약하세요.
    2. 문체: 전문적인 개조식 어투(~함, ~임)를 사용하며, 절대 '합니다/입니다'를 섞지 마세요.
    3. 구체성: 모호한 표현(예: 논의함, 검토함) 대신 구체적인 내용(예: ~에 대한 25% 인상안을 확정함)을 기술하세요.

    [분석 항목 가이드]
    각 분석 항목의 범위와 초점:
    - 핵심요약: 회의 전체를 3~5개 불렛으로 압축한 경영진 요약. 배경·결정·다음 단계를 포괄
    - 주요 논의 내용: 논의된 주제별로 어떤 의견·제안·쟁점이 오갔는지 기술. 최종 결론이 아닌 토의 과정 중심
    - 아젠다별 요약: 각 아젠다 항목별로 논의 내용과 결과를 정리. 아젠다 구분이 없으면 주제별로 자동 분류
    - 주요 결정 사항: 이번 회의에서 최종 확정된 사항만. 논의 중이거나 제안 수준인 내용은 제외
    - To-Do List: 담당자와 기한이 식별되는 실행 과제만 추출. 불명확한 경우 비고란에 명시
    - 리스크/이슈: 잠재적 위험·장애 요인·우려사항. 미결정사항과 달리 이미 식별된 문제 중심
    - 향후 일정: 주요 마일스톤과 단계별 일정. 개인 과제(To-Do)보다 팀·조직 수준의 계획 중심
    - 미결정사항: 논의되었으나 결론이 나지 않아 차후 재논의가 필요한 사항 목록

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

    let lastError: unknown = null;
    let successText: string | null = null;
    let modelUsed: string | null = null;

    // Try each model in the chain.
    outer: for (const modelName of MODEL_CHAIN) {
      // For each model, retry with backoff.
      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay > 0) {
          try {
            await sleep(delay, req.signal);
          } catch {
            return NextResponse.json(
              { error: "요청이 취소되었습니다." },
              { status: 499 }
            );
          }
        }

        try {
          const text = await callGemini(
            apiKey,
            modelName,
            systemPrompt,
            userPrompt,
            req.signal
          );
          successText = text;
          modelUsed = modelName;
          break outer;
        } catch (err) {
          lastError = err;
          if (req.signal.aborted) {
            return NextResponse.json(
              { error: "요청이 취소되었습니다." },
              { status: 499 }
            );
          }
          if (!isTransientError(err)) {
            // Non-transient on the primary model — still try the next model
            // in the chain, since a bad request may be a per-model quirk.
            console.warn(
              `[analyze] non-transient error on ${modelName} attempt ${attempt + 1}:`,
              err instanceof Error ? err.message : err
            );
            break; // break retry loop, go to next model
          }
          console.warn(
            `[analyze] transient error on ${modelName} attempt ${attempt + 1}/${RETRY_DELAYS_MS.length}, retrying...`
          );
        }
      }
    }

    if (!successText || !modelUsed) {
      const message =
        lastError instanceof Error ? lastError.message : "Unknown error";
      console.error("[analyze] all models/retries exhausted:", message);
      return NextResponse.json(
        {
          error:
            "AI 분석 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.",
          details: message,
        },
        { status: 503 }
      );
    }

    if (modelUsed !== MODEL_CHAIN[0]) {
      console.log(
        `[analyze] primary model unavailable; succeeded with fallback: ${modelUsed}`
      );
    }

    try {
      const analysisResult = JSON.parse(successText);
      return NextResponse.json(analysisResult);
    } catch (parseError) {
      console.error(
        "[analyze] Gemini JSON parse error, trying regex fallback:",
        parseError
      );
      const jsonMatch = successText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysisResult = JSON.parse(jsonMatch[0]);
          return NextResponse.json(analysisResult);
        } catch {
          /* fall through */
        }
      }
      return NextResponse.json(
        {
          error: "AI 응답을 처리하는 중 오류가 발생했습니다 (Invalid JSON).",
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("[analyze] Route error:", error);
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
