/**
 * Generic SSE (Server-Sent Events) stream parser.
 *
 * Handles all shared SSE mechanics:
 *   - Buffered line splitting on "\n"
 *   - "data:" prefix filtering
 *   - "[DONE]" sentinel detection → closes the downstream stream
 *   - JSON.parse per frame (bad / malformed frames are silently skipped)
 *   - Delegates provider-specific field extraction to `extractText`
 *
 * @param raw         Raw ReadableStream<Uint8Array> from fetch().body
 * @param extractText Callback that receives the parsed JSON object and should
 *                    return the text string to enqueue, or null/undefined to skip.
 *                    The callback is typed as `(parsed: unknown)` so each provider
 *                    can safely cast to its own response shape internally.
 */
export function makeSseStream(
  raw: ReadableStream<Uint8Array>,
  extractText: (parsed: unknown) => string | null | undefined
): ReadableStream<Uint8Array> {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const reader = raw.getReader();
  let buf = "";

  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          ctrl.close();
          return;
        }

        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");

        // Keep the last (potentially incomplete) line in the buffer.
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const s = line.trim();

          if (!s.startsWith("data:")) continue;

          const json = s.slice(5).trim();

          if (json === "[DONE]") {
            ctrl.close();
            return;
          }

          try {
            const parsed: unknown = JSON.parse(json);
            const text = extractText(parsed);
            if (text) {
              ctrl.enqueue(enc.encode(text));
            }
          } catch {
            // Skip malformed frames — matches existing provider behavior.
          }
        }
      }
    },

    cancel() {
      void reader.cancel();
    },
  });
}
