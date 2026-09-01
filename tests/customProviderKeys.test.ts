import { GeminiProvider } from "../src/services/providers/GeminiProvider";
import { GroqProvider } from "../src/services/providers/GroqProvider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return output + decoder.decode();
    if (value) output += decoder.decode(value, { stream: true });
  }
}

async function run() {
  const originalFetch = globalThis.fetch;
  try {
    let requestedUrl = "";
    let requestedAuth = "";
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input);
      requestedAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      if (requestedUrl.includes("generativelanguage.googleapis.com")) {
        return new Response('data: {"candidates":[{"content":{"parts":[{"text":"Gemini works"}]}}]}\n\n', { status: 200 });
      }
      return new Response('data: {"choices":[{"delta":{"content":"Groq works"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
    }) as typeof fetch;

    const gemini = new GeminiProvider("AIza-personal-test-key");
    const geminiText = await readStream(await gemini.streamResponse({ mode: "text", provider: "gemini", text: "hello" }));
    assert(requestedUrl.includes("key=AIza-personal-test-key") && geminiText === "Gemini works", "Gemini must use a supplied personal key");

    const groq = new GroqProvider("gsk_personal_test_key");
    const groqText = await readStream(await groq.streamResponse({ mode: "text", provider: "groq", text: "hello" }));
    assert(requestedAuth === "Bearer gsk_personal_test_key" && groqText === "Groq works", "Groq must use a supplied personal key");
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("✅ Personal Gemini and Groq key forwarding passed.");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
