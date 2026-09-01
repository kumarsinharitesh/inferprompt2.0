import { OpenRouterProvider } from "../src/services/providers/OpenRouterProvider.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return result + decoder.decode();
    if (value) result += decoder.decode(value, { stream: true });
  }
}

const validRisk = {
  riskScore: 25,
  riskLevel: "LOW",
  recommendation: "ALLOW",
  confidence: 88,
  reasoning: "The available transaction signals are low risk.",
  riskFactors: [],
};

async function runTests() {
  console.log("Starting OpenRouter provider regression tests...");
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";

  try {
    const calls: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_input, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validRisk) } }] }), { status: 200 });
    }) as typeof fetch;

    const provider = new OpenRouterProvider();
    const riskStream = await provider.streamResponse({
      mode: "text",
      provider: "openrouter",
      systemPrompt: "You are a payment-risk analysis model.",
      text: "Analyse this transaction.",
    });
    assert(await readStream(riskStream) === JSON.stringify(validRisk), "Risk output should be a complete JSON object");
    assert(calls[0].model === "openrouter/free", "Risk requests must use the official free router");
    assert(JSON.stringify(calls[0].response_format) === JSON.stringify({ type: "json_object" }), "Risk requests should prefer structured output");

    calls.length = 0;
    globalThis.fetch = (async (_input, init) => {
      calls.push(JSON.parse(String(init?.body)));
      if (calls.length === 1) return new Response("unsupported response format", { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(validRisk)}\n\`\`\`` } }] }), { status: 200 });
    }) as typeof fetch;

    const fallbackStream = await provider.streamResponse({
      mode: "text",
      provider: "openrouter",
      systemPrompt: "You are a payment-risk analysis model.",
      text: "Analyse this transaction.",
    });
    assert(await readStream(fallbackStream) === JSON.stringify(validRisk), "Fallback should extract fenced JSON");
    assert(calls.length === 2, "Unsupported structured output should make exactly one fallback request");
    assert(!("response_format" in calls[1]), "Fallback must omit unsupported response_format");
    assert(calls.every(call => call.model === "openrouter/free"), "Fallback must never pin a retiring free model");
    console.log("OpenRouter provider regression tests passed.");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
}

runTests().catch(error => {
  console.error(error);
  process.exit(1);
});
