import fs from "fs";

// Simple .env parser
const envContent = fs.readFileSync(".env", "utf8");
const match = envContent.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : null;

if (!apiKey) {
  console.error("GEMINI_API_KEY not found in .env");
  process.exit(1);
}

async function checkModels() {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.error) {
      console.error("API Error:", data.error.message);
      return;
    }

    console.log("=== Available Models for your API Key ===");
    data.models?.forEach(m => {
      console.log(`- ${m.name}`);
      console.log(`  DisplayName: ${m.displayName}`);
      console.log(`  Supported: ${m.supportedGenerationMethods.join(", ")}`);
    });

  } catch (err) {
    console.error("Network Error:", err.message);
  }
}

checkModels();
