import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

try {
  const envContent = fs.readFileSync(".env", "utf8");
  const apiKey = envContent.split("\n")
    .find(line => line.startsWith("GEMINI_API_KEY="))
    ?.split("=")[1]
    ?.trim()
    ?.replace(/^"|"$/g, ""); // Remove quotes if any

  if (!apiKey) {
    console.error("GEMINI_API_KEY not found in .env");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  async function run() {
    try {
      // In some versions it might be listModels()
      const result = await genAI.listModels(); 
      console.log("=== Available Models ===");
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("Error listing models:", err.message);
    }
  }
  run();
} catch (e) {
  console.error("File error:", e.message);
}
