import type { Provider, ModelRiskResult } from "../types";

function extractJsonText(raw: string): string {
    let cleaned = raw.trim();

    // Strip <think>...</think> if present (e.g., DeepSeek models)
    const thinkStart = cleaned.indexOf("<think>");
    const thinkEnd = cleaned.indexOf("</think>");
    if (thinkStart !== -1 && thinkEnd !== -1) {
        cleaned = cleaned.substring(0, thinkStart) + cleaned.substring(thinkEnd + 8);
        cleaned = cleaned.trim();
    }

    // Try to heavily isolate standard JSON fence blocks if prefixed by CoT text
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
        cleaned = jsonMatch[1].trim();
    } else {
        // Fallback: Just try to slice manually between first { and last }
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        } else if (firstBrace !== -1) {
            cleaned = cleaned.substring(firstBrace);
        }
    }

    return cleaned;
}

export function parseModelRiskResult(
    provider: Provider,
    rawOutput: string,
    metrics: { latencyMs: number; tokenCount: number }
): ModelRiskResult {
    try {
        const jsonText = extractJsonText(rawOutput);

        let parsed: any;
        try {
            parsed = JSON.parse(jsonText);
        } catch (err) {
            // Smart truncation repair — avoid O(n²) char-by-char loop.
            // Strategy: walk forward tracking brace/bracket depth to find candidate
            // truncation points, then try a small set of closing suffixes.
            const SUFFIXES = ['"]}]}', '"}]}', '}]}', '"]}', ']}', '}'];
            let repaired = false;

            // Phase 1: Find candidate trim points by scanning depth changes
            const candidates: number[] = [];
            let depth = 0;
            let inString = false;
            let escape = false;
            for (let i = 0; i < jsonText.length; i++) {
                const ch = jsonText[i];
                if (escape) { escape = false; continue; }
                if (ch === '\\' && inString) { escape = true; continue; }
                if (ch === '"') { inString = !inString; continue; }
                if (inString) continue;
                if (ch === '{' || ch === '[') depth++;
                else if (ch === '}' || ch === ']') {
                    depth--;
                    if (depth <= 1) candidates.push(i + 1); // record recoverable positions
                }
            }

            // Phase 2: Try candidates from the end, bail after 200 attempts
            const trimPoints = [...candidates].reverse().slice(0, 200);
            for (const pos of trimPoints) {
                const slice = jsonText.substring(0, pos);
                for (const suffix of SUFFIXES) {
                    try {
                        parsed = JSON.parse(slice + suffix);
                        repaired = true;
                        break;
                    } catch (_) { }
                }
                if (repaired) {
                    console.log(`[Parser] Repaired truncated JSON for ${provider} at pos ${pos}`);
                    break;
                }
            }

            if (!repaired) {
                // Last resort: try the full text with each suffix
                for (const suffix of SUFFIXES) {
                    try { parsed = JSON.parse(jsonText + suffix); repaired = true; break; } catch (_) { }
                }
            }

            if (!repaired) {
                throw new Error("Result is not a JSON object. (Truncated string recovery failed natively)");
            }
        }

        if (!parsed || typeof parsed !== "object") {
            throw new Error("Result is not a JSON object.");
        }

        // Type validation
        if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.riskLevel)) {
            throw new Error(`Invalid riskLevel: ${parsed.riskLevel}`);
        }
        if (typeof parsed.riskScore !== "number" || parsed.riskScore < 0 || parsed.riskScore > 100) {
            throw new Error(`Invalid riskScore: ${parsed.riskScore}`);
        }
        if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 100) {
            throw new Error(`Invalid confidence: ${parsed.confidence}`);
        }
        if (!["ALLOW", "REVIEW", "BLOCK"].includes(parsed.recommendation)) {
            throw new Error(`Invalid recommendation: ${parsed.recommendation}`);
        }
        if (typeof parsed.reasoning !== "string") {
            throw new Error("Missing or invalid reasoning.");
        }
        if (!Array.isArray(parsed.riskFactors)) {
            throw new Error("Missing or invalid riskFactors array.");
        }

        // Validate risk factors contents — be lenient: only require name,
        // default missing/invalid severity to MEDIUM so reasoning models don't fail.
        for (let i = 0; i < parsed.riskFactors.length; i++) {
            const rf = parsed.riskFactors[i];
            if (!rf.name || typeof rf.name !== "string") {
                // Skip completely invalid entries rather than killing the whole result
                parsed.riskFactors.splice(i--, 1);
                continue;
            }
            const validSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
            if (!validSeverities.includes(rf.severity)) {
                rf.severity = "MEDIUM"; // Safe default
            }
        }

        return {
            provider,
            riskLevel: parsed.riskLevel,
            riskScore: parsed.riskScore,
            confidence: parsed.confidence,
            riskFactors: parsed.riskFactors,
            recommendation: parsed.recommendation,
            reasoning: parsed.reasoning,
            latencyMs: metrics.latencyMs,
            tokenCount: metrics.tokenCount,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            provider,
            // Provide fallback values so the UI component can still render an error state safely
            // though typically the UI will just display `error` instead.
            riskLevel: "CRITICAL",
            riskScore: 0,
            confidence: 0,
            riskFactors: [],
            recommendation: "REVIEW",
            reasoning: "",
            error: `Failed to parse response: ${message}`,
            latencyMs: metrics.latencyMs,
            tokenCount: metrics.tokenCount,
        };
    }
}
