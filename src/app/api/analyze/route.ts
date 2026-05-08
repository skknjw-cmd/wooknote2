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

## 절대 원칙
1. JSON 구조·키 이름 변경 금지.
2. 섹션 name은 분석 요청 항목 문자열과 완전히 동일하게.
3. 내용 없는 섹션도 반드시 포함, content: [].
4. 문체: 개조식(~함, ~임, ~예정). '합니다/입니다' 금지.
5. 구체적 수치·날짜·담당자 명시. 추상적 서술 금지.
6. 불명확한 내용은 항목 끝에 [원문 확인 필요] 표기.
7. 중요도 순 정렬 (시간 순 아님).

## 화자 처리
- "화자 1/2/3"을 문맥으로 역할명(구매팀, 개발팀, 공급사 측 등)으로 대체. 불명확 시에만 "화자 N" 유지.
- "음", "어", "그러니까", "네 알겠습니다" 등 필러·단순 맞장구 무시.

## 핵심 포맷 규칙: "한 항목 = 한 사실"
- 여러 사실을 하나의 긴 문장으로 합치지 말 것.
- 각 bullet은 읽었을 때 내용을 이해할 수 있어야 함. 키워드만 나열하거나 지나치게 축약 금지.
- 단락(paragraph) 형식 금지. description은 항상 한 문장.

## 섹션별 작성 규칙

**핵심요약** (3~5개)
- 이 회의에서 일어난 일을 모르는 사람이 읽어도 파악할 수 있는 수준으로 작성.
- title: 주제명 (간결하게)
- description: [배경/현황] → [결과/방향] 형식의 한 문장
  예) title: "Q2 공급 물량 협상", description: "구매팀이 전년 대비 20% 증량 요청 → 공급사가 15% 수용으로 합의"

**주요 논의 내용**
- 회의에서 다뤄진 논점을 항목별로 분리해 작성.
- title: 논점 주제
- description: 누가 어떤 입장이었는지, 어떤 쟁점이 있었는지를 한 문장으로. 결론 아닌 과정.
  예) title: "단가 인하 협상", description: "구매팀은 원가 상승 이유로 10% 인하 요구, 공급사는 마진 한계로 5%까지만 가능하다는 입장"

**주요 결정사항**
- title: 무엇이 결정되었는지 (주체 포함)
- description: 결정 조건 또는 근거 (없으면 빈 문자열 "")
  예) title: "공급 단가 7% 인하 확정 (양사 합의)", description: "6개월 후 원가 재검토 조건부"

**실행과제 (To-Do List)**
- task: "동사+목적어+배경/이유" 형식. 이 항목만 봐도 무엇을, 왜 해야 하는지 알 수 있어야 함.
  ❌ 나쁜 예: "품의서 작성 및 결제" (맥락 없음)
  ✅ 좋은 예: "신규 공급업체 A사 계약금 품의서 작성 및 회계팀 결제 요청 (이번 주 지급 마감)"
  ❌ 나쁜 예: "납기 조정 협의"
  ✅ 좋은 예: "현재 14일 납기를 7일로 단축 가능한지 공급사와 협의"
- owner: 담당자명 또는 팀명. 불명확 시 "미정"
- due: 기한. 불명확 시 "미정"
- notes: 완료기준 — 언제, 어떤 상태가 되면 완료인지 구체적으로 (예: "공급사로부터 납기 단축 가능 여부 서면 회신 수령 시")

**미결정사항**
- title: 무엇이 결정되지 않았는지
- description: 왜 미결인지 + 언제까지 결정 필요한지
  예) title: "2분기 추가 물량 여부", description: "공급사 생산 라인 확인 후 결정 필요, 이번 주 내 회신 요청"

**향후 일정**
- title: 날짜 또는 기한
- description: 어떤 일정인지 구체적으로

## JSON 구조
{
  "title": "회의 제목",
  "date": "회의 일시",
  "attendees": ["참석자1", "참석자2"],
  "sections": [
    { "name": "섹션명", "type": "numbered", "content": [{ "title": "제목", "description": "설명" }] },
    { "name": "실행과제 (To-Do List)", "type": "table", "content": [{ "task": "과제", "owner": "담당자", "due": "기한", "prio": "상/중/하", "notes": "완료기준" }] }
  ]
}

numbered 타입: 핵심요약, 주요 논의 내용, 주요 결정사항, 미결정사항, 향후 일정
table 타입: 실행과제 (To-Do List) 전용

## 회의 정보
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
