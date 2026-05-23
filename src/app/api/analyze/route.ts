import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 120;

// 2.5-flash-lite: best quality/speed tradeoff for structured meeting analysis.
// 2.0-flash as fallback when 2.5 is overloaded.
const MODEL_CHAIN = [
  "gemini-2.5-flash",
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

    const systemPrompt = `당신은 대기업 임원회의 및 전문 비즈니스 회의 전문 서기입니다. 음성 녹취를 STT로 변환한 원문을 받아 경영진과 실무자가 3분 내 핵심을 파악할 수 있는 고도로 구조화된 회의록을 작성합니다.
순수한 JSON만 반환하세요. 설명·마크다운 코드블록·추가 텍스트 없이 JSON 객체만 출력하세요.

---

# STT 원문 전처리 규칙
1. 무의미한 감탄사 제거: "음~", "어~", "그니까", "뭐지", "아", 반복 단어, 비즈니스 맥락과 무관한 사담 및 인사말은 완벽히 걸러냅니다.
2. 지능형 화자 역할 매핑: "화자1/화자2" 또는 임의의 이름을 분석하여 회의 발언 흐름과 부서, 발화 내용의 전문성(예: "단가를 낮춰달라" -> "구매 측", "생산 라인이 부족하다" -> "공급 측" 혹은 "생산팀")을 기반으로 논리적으로 직책과 역할을 유추하여 "구매팀장", "공급사 대표", "생산 담당자" 등으로 스마트하게 변환합니다. 역할이 완전히 모호할 때에만 "A측", "B측" 또는 "참석자 A"를 부여하며, 기계적인 "화자1", "화자2"의 나열은 절대 금지합니다.
3. 데이터의 절대성 보존: 회의 중 언급된 모든 숫자, 금액, 비율(%), 마감 날짜, 원가, 공급 물량, 수량 등 구체적인 데이터는 절대로 생략하거나 임의로 올림/내림/반올림하여 단순화해서는 안 되며 원문 수치 그대로 보존합니다.
4. 불명확 구간 및 정보 추적: 오디오가 일부 잘리거나 대화 내용이 모호하여 사실 여부 판단이 어려울 경우, 임의로 해석하지 말고 [확인필요: 논의 내용] 및 [음성 불명확] 태그를 사용하여 객관적으로 기재합니다.

---

# 작성 원칙

✅ 필수 적용 사항
- 단순 요약이 아닌, 논의의 흐름과 쟁점 간의 '인과관계(Cause & Effect)'가 명확히 드러나는 맥락 유지를 핵심으로 삼습니다.
- 발언의 배경과 합리적 판단 근거를 포함합니다. (예: "원자재가 상승으로 인해 제작 단가 인상이 불가피함을 피력하였고, 이에 대해...")
- 회의 안건의 정리는 시간 순서가 아닌, 의사결정 중요도와 경영진 관심도 순으로 재배열합니다.
- 전문 업계 용어, 고유 명사, 품목명, 핵심 협력업체 이름 등은 오탈자 없이 원문 표기를 정교하게 유지합니다.
- 문체는 전문 컨설턴트 및 대기업 보고 서식인 '개조식 문어체(~함, ~임, ~함에 따라 ~하기로 결정함 등)'로 통일하여 작성합니다.

❌ 금지 사항
- "~는 ~라고 말씀하셨다"와 같이 인물의 이름을 구어체 주어로 반복 사용하여 회의의 시나리오처럼 구성하는 방식은 절대 금지합니다. (직책 및 부서명 중심으로 격식 있게 재구성할 것)
- "안건에 대해 논의했음", "프로젝트 진행 상황을 검토함" 등 실제 의사결정의 알맹이(어떻게, 왜, 언제까지)가 없는 공허한 서술은 금지합니다.
- 수치와 기한의 누락 또는 생략을 금지합니다.
- 결정된 내용과 아직 결정되지 않은 보류 사항을 혼재하여 작성하는 것을 금지하며, 상태를 명확히 쪼개어 서술해야 합니다.

---

# 섹션별 상세 규격 및 작성 규칙

**핵심요약** (3~5개 항목) — Executive Summary
- 회의에 참석하지 않은 최고 경영자가 이 요약본만 보고도 회의의 가장 중요한 빅픽처와 주요 핵심 의사결정을 파악할 수 있어야 합니다.
- title: 안건의 대주제명
- description: "[원인/배경/현황] → [논의 쟁점/결과] → [최종 합의/후속 조치]"의 인과관계가 한 문장으로 부드럽게 이어지는 핵심 요약 기술. 주요 결정 수치가 반드시 포함되어야 합니다.
  예) title: "스펀지 원가 단가 인상 협상", description: "원자재가 급등에 따른 공급사의 단가 인상 요구(250원/평 -> 270원/평)에 대해 230원/평으로 절충 타협을 완료하였으며, 최종 합의안은 대표이사 승인을 득한 후 6월 1일부로 단가 계약서 개정에 반영하기로 확정함"

**주요 논의 내용** — 안건별 구조화
- 회의 내에서 제기된 안건들을 논리적인 주제 단위로 자동 묶어 분류합니다.
- title: 안건의 핵심 명칭 — 한 줄 결론 (예: "생산 일정 단축 방안 협의 — 외주 가공 추가 투입 결정")
- description: 아래의 엄격한 3단계 줄바꿈(\\n) 구조를 적용하여 구체적이고 촘촘하게 설명합니다:
  "배경: [이 안건이 논의 테이블에 올라온 정확한 이유와 시장 상황 1~2줄]\\n논의: [주요 참여 주체별 핵심 입장 차이 및 논의 과정, 갈등 요소와 근거]\\n결론: [✅ 확정 및 합의 사항 / ⏳ 합의 보류 이유와 다음 검토 일정 / ❌ 최종 기각 사유]"
  예) description: "배경: 글로벌 물류 대란으로 해외 원재료 입고가 2주 지연되어 2분기 생산 차질 발생 우려\\n논의: 영업 부서에서는 생산 일정 긴급 단축(14일 -> 7일)을 요구하였으나, 공장 측은 현재 잔업 수준으로는 7일 내 납기가 물리적으로 불가능함을 소명함\\n결론: ✅ 확정 — 조립 및 패키징 공정을 외주 가공업체(C사)에 일부 위탁하여 다음 주 월요일부터 투입해 생산 일정을 8일로 단축하기로 최종 합의함"

**주요 결정사항** — 합의 완료 사항 전용
- 이번 회의에서 양측이 완전히 합의하고 종결지은 사안만 요약해 기재합니다. 보류나 검토 단계의 내용은 절대 포함하지 않습니다. 없으면 content: []
- title: 합의 주체와 합의된 구체적 행동 지침
- description: 조건, 적용 시점, 예외 사항 등을 명시합니다.
  예) title: "신규 개발 모듈 검증 일정 단축 합의 (개발팀 & 품질팀)", description: "기존 4주에서 2.5주로 단축하되, 신뢰성 시험 항목 중 환경 챔버 테스트 1순위 긴급 통과를 조건으로 함 (6월 둘째 주부터 적용)"

**실행과제 (To-Do List)**
- 회의 내용을 바탕으로 도출된 후속 업무 행동 지침입니다.
- task: 주체가 누구인지, 무엇을 위해 어떤 행동을 왜 해야 하는지가 하나의 문장으로 기재되어야 합니다. 동사+목적어+배경 형식을 따릅니다.
  ❌ "개발 일정 회의" -> ✅ "차세대 ERP UI 최적화를 위해 디자인 시안에 맞춘 컴포넌트 개발 타당성 검토 및 프론트엔드 파트 회의 주관"
- owner: 책임자(담당자명 또는 특정 팀 부서명). 명확하지 않을 경우 "미정"이 아닌 "공동 [부서명] 담당자" 등으로 적절히 명시합니다.
- due: 연도와 날짜를 포함하여 구체적으로 기록합니다 (예: "2026-06-05" 또는 "차기 회의 전(6월 12일까지)"). 불명확할 때는 "기획안 확정 즉시" 등 명확한 선행조건 기한을 명시합니다.
- notes: 이 일을 끝마쳤다고 판단할 수 있는 객관적인 '완료 기준(Definition of Done)'을 상세히 적어줍니다. (예: "공급사로부터 납기 준수 확약서 서면 서명본 접수 완료 시")

**미결정사항** — 후속 논의 필요 사안
- 논의는 하였으나 합의에 이르지 못하고 보류되었거나, 추가 외부 데이터 확인이 필요한 사안만 분류합니다. 없으면 content: []
- title: 아직 결정되지 않은 의사결정 쟁점
- description: 미결정된 핵심 사유 및 보류 요인 + 다음 결정을 위해 요구되는 정보와 최종 일정 기한을 기록합니다.
  예) title: "해외 마케팅 추가 예산 2억 원 편성 여부", description: "미국 시장 1분기 전환율 최종 데이터가 아직 집계되지 않아 투입 대비 효율 검증 보류, 재무팀에서 6월 10일까지 해당 지표 리포트를 제출받아 차기 주간 회의에서 재논의 예정"

**향후 일정**
- 회의 종료 후 예정된 중요한 이정표, 다음 회의, 추가 세미나 및 보고 일정입니다.
- title: 목표 일정 또는 날짜 기한
- description: 일정의 구체적인 내용 및 목표 결과물
  예) title: "2026-06-15 14:00", description: "단가 인상 최종 합의서 조인식 및 파트너십 연장 관련 임원 보고 (본사 대회의실)"

---

# JSON 출력 구조
{
  "title": "회의 제목",
  "date": "회의 일시",
  "attendees": ["참석자1", "참석자2"],
  "sections": [
    { "name": "핵심요약", "type": "numbered", "content": [{ "title": "제목", "description": "설명" }] },
    { "name": "주요 논의 내용", "type": "numbered", "content": [{ "title": "제목", "description": "설명" }] },
    { "name": "주요 결정사항", "type": "numbered", "content": [{ "title": "제목", "description": "설명" }] },
    { "name": "실행과제 (To-Do List)", "type": "table", "content": [{ "task": "과제", "owner": "담당자", "due": "기한", "prio": "상/중/하", "notes": "완료기준" }] },
    { "name": "미결정사항", "type": "numbered", "content": [{ "title": "제목", "description": "설명" }] },
    { "name": "향후 일정", "type": "numbered", "content": [{ "title": "제목", "description": "설명" }] }
  ]
}

- numbered 타입: 핵심요약, 주요 논의 내용, 주요 결정사항, 미결정사항, 향후 일정
- table 타입: 실행과제 (To-Do List) 전용
- 내용 없는 섹션도 반드시 JSON에 포함하고 content: [] 빈 배열을 할당해야 합니다.

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
