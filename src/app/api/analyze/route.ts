import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 120;

// 2.5-flash-lite: best quality/speed tradeoff for structured meeting analysis.
// 2.0-flash as fallback when 2.5 is overloaded.
const MODEL_CHAIN = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

// Two attempts per model max to stay well under the 120s limit.
const RETRY_DELAYS_MS = [0, 3000];

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
        temperature: 0,
        maxOutputTokens: 8192,
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

    const systemPrompt = `당신은 전문 회의록 작성 AI입니다. 회의 내용을 분석하여 순수한 JSON만 반환하세요. 설명, 마크다운 코드블록, 추가 텍스트 없이 JSON 객체만 출력하세요.

[핵심 지침]
1. 반드시 아래 JSON 구조를 그대로 사용하세요. 키 이름을 바꾸거나 구조를 변경하지 마세요.
2. 분석 요청 항목에 해당하는 섹션은 내용이 없어도 반드시 포함하고, content는 빈 배열([])로 두세요.
3. 섹션 name은 반드시 분석 요청 항목과 정확히 동일한 문자열을 사용하세요.
4. 문체: 개조식 어투(~함, ~임) 사용, '합니다/입니다' 금지.
5. 구체적 사실만 기술. 불명확한 내용은 반드시 [원문 확인 필요] 표기.

[작성 품질 규칙]
- 화자 표기: 트랜스크립트에 "화자 1", "화자 2"로 표기되어 있어도, 문맥으로 역할을 파악해 구매팀, 공급사 측, 법무팀, 개발팀 등 역할명으로 기술. 역할이 전혀 불명확한 경우에만 "화자 N" 유지.
- 불필요 발화 제거: "음", "어", "저기요", "그러니까", "네 알겠습니다" 같은 필러(filler)와 단순 맞장구는 무시.
- 중요도 순 정렬: 시간 순이 아닌 사안 중요도 기준으로 내림차순 정렬.
- 불명확 내용: 음성 인식 오류가 의심되거나 내용이 모호한 경우 항목 끝에 [원문 확인 필요] 추가.

[섹션별 작성 규칙]
- 핵심요약: 각 bullet에 [주제] + [현재 상황/배경] + [결과/방향] 3요소를 한 문장으로 기술, 3~5개.
  예: "Q2 공급 물량: 작년 대비 20% 증량 요청 상황에서 → 공급사 15% 수용으로 합의 도출"
- 주요 논의 내용: 토의 과정의 핵심 논점·입장 대립. 결론이 아닌 과정 기술.
- 주요 결정사항: 최종 확정 사항만. description에 결정의 근거나 조건 포함.
- 실행과제 (To-Do List): notes 필드에 완료기준 반드시 기재 (예: "계약서 초안 공유 시 완료"). 담당자·기한 불명확 시 "미정" 기재.
- 미결정사항: title = 핵심 쟁점, description = 현재 상황 및 결정 필요 사항. 결정 예정일이 언급됐으면 포함.
- 향후 일정: 팀/조직 수준 마일스톤. title = 날짜, description = 일정 내용.

[데이터 구조]
{
  "title": "회의 제목",
  "date": "회의 일시",
  "attendees": ["참석자1", "참석자2"],
  "sections": [
    { "name": "섹션명", "type": "numbered", "content": [{ "title": "제목", "description": "설명" }] },
    { "name": "실행과제 (To-Do List)", "type": "table", "content": [{ "task": "과제", "owner": "담당자", "due": "기한", "prio": "상/중/하", "notes": "완료기준" }] }
  ]
}

[규칙]
- numbered 타입: 핵심요약, 주요 논의 내용, 주요 결정사항, 미결정사항, 향후 일정
- table 타입: 실행과제 (To-Do List) 전용
- 내용이 없는 섹션도 반드시 포함하고 content: [] 로 유지

회의 정보:
- 제목: ${meetingInfo.title}
- 일시: ${meetingInfo.date}
- 참석자: ${meetingInfo.attendees}

분석 요청 항목 (sections name에 이 문자열을 정확히 사용): ${selectedOptions.join(", ")}
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
      // Strip markdown code fences if present
      const cleaned = successText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const analysisResult = JSON.parse(cleaned);
      const sectionNames = (analysisResult.sections ?? []).map((s: { name: string }) => s.name);
      console.log(`[analyze] ok model=${modelUsed} sections=[${sectionNames.join(",")}]`);
      return NextResponse.json(analysisResult);
    } catch (parseError) {
      console.error("[analyze] JSON parse error. raw (first 500):", successText.slice(0, 500));
      const jsonMatch = successText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysisResult = JSON.parse(jsonMatch[0]);
          const sectionNames = (analysisResult.sections ?? []).map((s: { name: string }) => s.name);
          console.log(`[analyze] fallback ok sections=[${sectionNames.join(",")}]`);
          return NextResponse.json(analysisResult);
        } catch {
          /* fall through */
        }
      }
      return NextResponse.json(
        { error: "AI 응답을 처리하는 중 오류가 발생했습니다 (Invalid JSON)." },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("[analyze] Route error:", error);
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
