import type { Provider, ModelRiskResult } from "../types";

function extractJsonText(raw: string): string {
    let cleaned = raw.trim();

    // Strip <think>...</think> (DeepSeek, Qwen3 via content field)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");

    // Strip <|think|>...<|/think|> (Qwen3 alternate delimiter)
    cleaned = cleaned.replace(/<\|think\|>[\s\S]*?<\|\/think\|>/gi, "");

    // If a think block opened but never closed, cut everything from it onward
    const thinkOpen = cleaned.search(/<think>|<\|think\|>/i);
    if (thinkOpen !== -1) cleaned = cleaned.substring(0, thinkOpen);

    cleaned = cleaned.trim();

    // Extract JSON from markdown fences (```json ... ``` or ``` ... ```)
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
        cleaned = jsonMatch[1].trim();
    } else {
        // Fallback: slice between outermost { and }
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

const normalizedKey = (key: string) => key.replace(/[^a-z0-9]/gi, "").toLowerCase();

function pick(source: Record<string, unknown>, names: string[]): unknown {
    const wanted = new Set(names.map(normalizedKey));
    return Object.entries(source).find(([key]) => wanted.has(normalizedKey(key)))?.[1];
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function numberInRange(value: unknown): number | null {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(numberValue)) return null;
    // Some providers express confidence/score as a 0-1 proportion.
    const normalized = numberValue >= 0 && numberValue <= 1 && numberValue !== 0 ? numberValue * 100 : numberValue;
    return normalized >= 0 && normalized <= 100 ? Math.round(normalized) : null;
}

function normalizeLevel(value: unknown, score: number | null): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null {
    const raw = typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
    const aliases: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
        LOW: "LOW", SAFE: "LOW", MINIMAL: "LOW",
        MEDIUM: "MEDIUM", MODERATE: "MEDIUM",
        HIGH: "HIGH", HIGH_RISK: "HIGH", ELEVATED: "HIGH", ELEVATED_RISK: "HIGH",
        CRITICAL: "CRITICAL", CRITICAL_RISK: "CRITICAL", VERY_HIGH: "CRITICAL", VERY_HIGH_RISK: "CRITICAL", SEVERE: "CRITICAL",
    };
    if (aliases[raw]) return aliases[raw];
    if (score === null) return null;
    if (score >= 75) return "CRITICAL";
    if (score >= 50) return "HIGH";
    if (score >= 25) return "MEDIUM";
    return "LOW";
}

function normalizeRecommendation(value: unknown, level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): "ALLOW" | "REVIEW" | "BLOCK" {
    const raw = typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
    if (["ALLOW", "APPROVE", "ACCEPT"].includes(raw)) return "ALLOW";
    if (["BLOCK", "DECLINE", "REJECT", "DENY"].includes(raw)) return "BLOCK";
    if (["REVIEW", "MANUAL_REVIEW", "INVESTIGATE"].includes(raw)) return "REVIEW";
    return level === "CRITICAL" ? "BLOCK" : level === "LOW" ? "ALLOW" : "REVIEW";
}

function normalizeRiskPayload(raw: Record<string, unknown>): Record<string, unknown> {
    // Free-router models occasionally wrap an otherwise valid schema,
    // including two levels such as { data: { assessment: { ... } } }.
    let source = raw;
    for (let depth = 0; depth < 3; depth++) {
        let nestedSource: Record<string, unknown> | null = null;
        for (const key of ["analysis", "riskAssessment", "risk_analysis", "assessment", "result", "data", "risk"]) {
            const nested = asRecord(pick(source, [key]));
            if (nested) {
                nestedSource = nested;
                break;
            }
        }
        if (!nestedSource) break;
        source = nestedSource;
    }

    const scoreValue = numberInRange(pick(source, ["riskScore", "risk_score", "score", "riskScorePercent", "risk_score_percent", "overallRiskScore", "overall_risk_score"]));
    const level = normalizeLevel(pick(source, ["riskLevel", "risk_level", "level", "riskCategory", "risk_category", "riskRating", "risk_rating", "overallRisk", "overall_risk"]), scoreValue);
    const score = scoreValue ?? (level === "CRITICAL" ? 85 : level === "HIGH" ? 65 : level === "MEDIUM" ? 40 : level === "LOW" ? 15 : null);
    if (score === null || level === null) {
        throw new Error("Missing both a valid risk score and risk level.");
    }

    const rawFactors = pick(source, ["riskFactors", "risk_factors", "factors", "flags", "riskSignals", "risk_signals"]);
    const riskFactors = Array.isArray(rawFactors)
        ? rawFactors.map(factor => typeof factor === "string"
            ? { name: factor, severity: "MEDIUM", description: factor }
            : factor)
        : [];
    const confidence = numberInRange(pick(source, ["confidence", "confidenceScore", "confidence_score"])) ?? 65;
    const reasoningValue = pick(source, ["reasoning", "rationale", "explanation", "summary"]);

    return {
        ...source,
        riskScore: score,
        riskLevel: level,
        confidence,
        recommendation: normalizeRecommendation(pick(source, ["recommendation", "action", "decision"]), level),
        reasoning: typeof reasoningValue === "string" ? reasoningValue : "Provider returned a structured risk assessment without narrative reasoning.",
        riskFactors,
    };
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

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Result is not a JSON object.");
        }
        parsed = normalizeRiskPayload(parsed);

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
