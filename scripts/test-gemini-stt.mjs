/**
 * Gemini 오디오 STT + 화자분리 테스트 스크립트
 *
 * 사용법:
 *   node scripts/test-gemini-stt.mjs <오디오파일경로>
 *
 * 지원 형식: webm, mp3, wav, ogg, flac, aac, aiff (20MB 이하)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, statSync, existsSync } from "fs";
import { extname, resolve } from "path";

// .env 파일 자동 로드 (dotenv 없이)
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const MIME_MAP = {
  ".webm": "audio/webm",
  ".mp3":  "audio/mp3",
  ".wav":  "audio/wav",
  ".ogg":  "audio/ogg",
  ".flac": "audio/flac",
  ".aac":  "audio/aac",
  ".aiff": "audio/aiff",
  ".m4a":  "audio/mp4",
};

const MODEL_CHAIN = [
  { model: "gemini-2.5-flash",      api: "v1" },
  { model: "gemini-2.5-flash-lite", api: "v1" },
];

const MAX_BYTES = 20 * 1024 * 1024;

const filePath = process.argv[2];
const apiKey   = process.env.GEMINI_API_KEY;

if (!filePath) {
  console.error("사용법: node scripts/test-gemini-stt.mjs <오디오파일경로>");
  process.exit(1);
}
if (!apiKey) {
  console.error(".env 파일에 GEMINI_API_KEY가 없습니다.");
  process.exit(1);
}

const ext      = extname(filePath).toLowerCase();
const mimeType = MIME_MAP[ext];
if (!mimeType) {
  console.error(`지원하지 않는 형식: ${ext}\n지원: ${Object.keys(MIME_MAP).join(", ")}`);
  process.exit(1);
}

const fileSize = statSync(filePath).size;
if (fileSize > MAX_BYTES) {
  console.error(`파일이 20MB를 초과합니다 (${(fileSize / 1024 / 1024).toFixed(1)}MB). File API가 필요합니다.`);
  process.exit(1);
}

console.log(`\n파일: ${filePath}`);
console.log(`크기: ${(fileSize / 1024).toFixed(1)} KB  |  형식: ${mimeType}`);
console.log("─".repeat(60));

const audioData = readFileSync(filePath).toString("base64");
const genAI     = new GoogleGenerativeAI(apiKey);

const prompt = `다음 회의 오디오를 한국어로 전사하고 화자를 분리해주세요.

규칙:
1. 각 발화를 [화자 1], [화자 2] 형식으로 레이블링하세요.
2. 같은 화자가 연속으로 말하면 하나로 묶으세요.
3. 두 명이 동시에 말하는 경우 (크로스토크) 각각 별도 줄에 표시하세요.
4. 발화 내용을 정확히 전사하고, 추측하지 마세요.
5. 침묵이나 잡음은 무시하세요.

출력 형식:
[화자 1] 발화 내용
[화자 2] 발화 내용
...`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let text = null;
let modelUsed = null;
const startTime = Date.now();

for (const { model: modelName, api } of MODEL_CHAIN) {
  console.log(`\n${modelName} (${api}) 시도 중...`);
  for (const delay of [0, 3000]) {
    if (delay) {
      console.log(`  ${delay / 1000}초 후 재시도...`);
      await sleep(delay);
    }
    try {
      const model = genAI.getGenerativeModel(
        { model: modelName, generationConfig: { temperature: 0.1 } },
        { apiVersion: api }
      );
      const result = await model.generateContent([
        { inlineData: { mimeType, data: audioData } },
        prompt,
      ]);
      text      = result.response.text();
      modelUsed = modelName;
      break;
    } catch (err) {
      const is503 = err.message.includes("503") || /high demand|overloaded|temporarily/i.test(err.message);
      console.error(`  실패: ${err.message.split("\n")[0]}`);
      if (!is503) break; // 503 아니면 다음 모델로
    }
  }
  if (text) break;
}

if (!text) {
  console.error("\n모든 모델이 실패했습니다. 잠시 후 다시 시도해주세요.");
  process.exitCode = 1;
} else {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Gemini 화자분리 결과 (${modelUsed}) ===\n`);
  console.log(text);
  console.log("\n" + "─".repeat(60));
  console.log(`처리 시간: ${elapsed}초`);

  const speakers = new Set();
  for (const m of text.matchAll(/\[화자 (\d+)\]/g)) speakers.add(m[1]);
  console.log(`감지된 화자 수: ${speakers.size}명 (${[...speakers].map(n => `화자 ${n}`).join(", ")})`);
}
