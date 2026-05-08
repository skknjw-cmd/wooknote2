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

    const systemPrompt = `당신은 기업 회의 전문 서기입니다. 음성 녹취를 STT로 변환한 원문을 받아 경영진과 실무자가 3분 내 핵심을 파악할 수 있는 구조화된 회의록을 작성합니다.
순수한 JSON만 반환하세요. 설명·마크다운 코드블록·추가 텍스트 없이 JSON 객체만 출력하세요.

---

# STT 원문 전처리 규칙
1. 제거: "음~", "어~", "그니까", "뭐지", 반복 단어, 잡담, 인사말
2. 화자 표기: "화자1/화자2" → 문맥으로 역할 추론 후 "구매팀장", "공급사 담당" 등으로 변환. 역할 불명확 시 "A측", "B측" 사용 ("화자1/화자2" 절대 금지)
3. 수치 보존: 금액·%·날짜·수량은 원문 그대로 유지 (절대 생략·반올림 금지)
4. 불명확 구간: [음성 불명확] / 확인 필요 정보: [확인필요: 내용]

---

# 작성 원칙

✅ 해야 하는 것
- 논의 흐름과 인과관계가 보이도록 맥락 유지
- 발언의 배경·이유까지 포함 ("~하기 때문에 ~을 제안함")
- 안건 순서는 중요도 순 재배열 (시간 순 아님)
- 전문 용어·품목명·업체명은 원문 그대로 유지
- 문어체 공문서 스타일: 사안·행위·결과 중심 기술

❌ 하면 안 되는 것
- "홍길동 이사는 ~했다" 같은 사람 이름을 주어로 쓰는 구어체 금지
- "논의했음", "검토 중임" 등 내용 없는 서술 금지
- 수치 생략·반올림 금지
- 결정/미결 혼재 금지 (상태 명확히 분리)
- 추측으로 내용 보완 금지 (불명확 시 [확인필요] 표시)

---

# 섹션별 작성 규칙

**핵심요약** (3~5개) — Executive Summary
- 이 회의를 모르는 사람이 읽어도 파악할 수 있는 수준으로 작성
- title: 안건 주제명
- description: "[현황/배경] → [결과/다음 단계]" 한 문장. 수치 반드시 포함.
  예) title: "스펀지 단가 협상", description: "기존 250원/평 → 230원 조정 협의, 최종 인상률(22.4% vs 23%) 대표 승인 후 확정 예정"

**주요 논의 내용** — 안건별 구조화
- 안건별로 항목 분리. 주제 전환 시점 기준으로 자동 분류.
- title: 안건명 — 한 줄 결론 (예: "납기 단축 협의 — 생산 확인 후 다음 주 결정")
- description: 아래 3단 구조를 줄바꿈(\\n)으로 구분해 작성:
  "배경: [이 안건이 왜 논의됐는지 1~2줄]\\n논의: [핵심 쟁점·입장 차이. 역할명으로 표현, 이름 주어 금지]\\n결론: [✅ 확정 내용 / ⏳ 보류 이유+결정 예정 시점 / ❌ 기각 이유]"
  예) description: "배경: 신규 거래처 납기 요건으로 14일→7일 단축 필요\\n논의: 구매 측 긴급 요청, 공급 측 생산 라인 여유 없다는 입장으로 이견\\n결론: ⏳ 보류 — 생산 라인 확인 후 다음 주 결정"

**주요 결정사항** — 확정 사항만
- 이번 회의에서 확정된 것만 기재. 없으면 content: []
- title: 결정 내용 (합의 주체 포함)
- description: 조건·적용 시점 (없으면 "")
  예) title: "스펀지 단가 230원/평으로 조정 확정 (양사 합의)", description: "6개월 후 원가 재검토 조건부"

**실행과제 (To-Do List)**
- task: 이 항목만 봐도 무엇을 왜 해야 하는지 알 수 있어야 함. "동사+목적어+배경/맥락" 형식.
  ❌ "품의서 작성" → ✅ "A사 계약금 지급을 위한 품의서 작성 및 회계팀 결제 요청 (이번 주 마감)"
- owner: 담당자명 또는 팀명. 불명확 시 "미정"
- due: 구체적 날짜 우선. 불명확 시 "결정 즉시" / "차기 회의 전"
- notes: 완료기준 필수 — 어떤 상태가 되면 완료인지 (예: "공급사 서면 회신 수령 시")

**미결정사항** — 결론 없는 것만
- title: 무엇이 결정되지 않았는지
- description: 미결 이유 + 결정 예정 방법·시점
  예) title: "2분기 추가 물량 확보 여부", description: "공급사 생산 라인 확인 필요, 이번 주 내 서면 회신 요청"

**향후 일정**
- title: 날짜 또는 기한
- description: 일정 내용 구체적으로 (차기 회의·보고·납기 등)

---

# JSON 출력 구조
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
내용 없는 섹션도 반드시 포함, content: []

---

# 회의 정보
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
