import { runABTD, tokenize } from "../src/utils/diff";

const left = "Hello Ritesh 👋🏽 — नमस्ते 🌍";
const right = "Hello Ritesh 👋🏽 — नमस्ते दुनिया 🌍";
const tokens = tokenize(left);
const result = runABTD(left, right);

if (!tokens.includes("👋") || result.tokensA.some(token => token.text.includes("�")) || result.tokensB.some(token => token.text.includes("�"))) {
  throw new Error("Unicode and emoji must be preserved by ABTD tokenization.");
}
if (result.stats.added === 0 || result.stats.similarityPct <= 0 || result.stats.similarityPct >= 100) {
  throw new Error("Unicode comparison should report a meaningful, bounded diff.");
}
console.log("✅ Unicode-safe ABTD comparison passed.");
