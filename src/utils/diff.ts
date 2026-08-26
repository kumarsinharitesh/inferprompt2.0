import type { DiffToken, DiffResult } from "../types";

export function tokenize(text: string): string[] {
  const matches = text.match(/\w+|[^\w\s]/g);
  return matches ?? [];
}

function buildFrequencyMap(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const tok of tokens) {
    freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }
  return freq;
}


function findAnchors(
  tokensA: string[],
  tokensB: string[],
  freqA: Map<string, number>,
  freqB: Map<string, number>
): Array<{ indexA: number; indexB: number; token: string }> {
  const onceBSet = new Set<string>();
  for (const [tok, count] of freqB) {
    if (count === 1) onceBSet.add(tok);
  }

  const anchors: Array<{ indexA: number; indexB: number; token: string }> = [];
  const bIndexMap = new Map<string, number>();

  for (let i = 0; i < tokensB.length; i++) {
    if (onceBSet.has(tokensB[i])) {
      bIndexMap.set(tokensB[i], i);
    }
  }

  for (let i = 0; i < tokensA.length; i++) {
    const tok = tokensA[i];
    if (freqA.get(tok) === 1 && onceBSet.has(tok)) {
      const bIdx = bIndexMap.get(tok);
      if (bIdx !== undefined) {
        anchors.push({ indexA: i, indexB: bIdx, token: tok });
      }
    }
  }

  return longestIncreasingAnchorSequence(anchors);
}


function longestIncreasingAnchorSequence(
  anchors: Array<{ indexA: number; indexB: number; token: string }>
): Array<{ indexA: number; indexB: number; token: string }> {
  if (anchors.length === 0) return [];

  const tails: number[] = []; 
  const predecessor: number[] = new Array(anchors.length).fill(-1);
  const tailIndex: number[] = []; 

  for (let i = 0; i < anchors.length; i++) {
    const bIdx = anchors[i].indexB;
    let lo = 0,
      hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < bIdx) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = bIdx;
    tailIndex[lo] = i;
    if (lo > 0) predecessor[i] = tailIndex[lo - 1];
  }

  const result: Array<{ indexA: number; indexB: number; token: string }> = [];
  let idx = tailIndex[tails.length - 1];
  while (idx !== -1) {
    result.unshift(anchors[idx]);
    idx = predecessor[idx];
  }
  return result;
}


function lcs(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: string[] = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}


function diffSegment(segA: string[], segB: string[]): { a: DiffToken[]; b: DiffToken[] } {
  const common = lcs(segA, segB);
  const resultA: DiffToken[] = [];
  const resultB: DiffToken[] = [];
  let ia = 0,
    ib = 0,
    ic = 0;

  while (ia < segA.length || ib < segB.length) {
    const matchA = ia < segA.length && ic < common.length && segA[ia] === common[ic];
    const matchB = ib < segB.length && ic < common.length && segB[ib] === common[ic];

    if (matchA && matchB) {
      resultA.push({ text: segA[ia], type: "equal" });
      resultB.push({ text: segB[ib], type: "equal" });
      ia++;
      ib++;
      ic++;
    } else if (!matchA && ia < segA.length) {
      resultA.push({ text: segA[ia], type: "delete" });
      ia++;
    } else if (!matchB && ib < segB.length) {
      resultB.push({ text: segB[ib], type: "insert" });
      ib++;
    } else {
      break;
    }
  }

  return { a: resultA, b: resultB };
}


export function runABTD(textA: string, textB: string): DiffResult {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  const freqA = buildFrequencyMap(tokensA);
  const freqB = buildFrequencyMap(tokensB);

  const anchors = findAnchors(tokensA, tokensB, freqA, freqB);

  const diffA: DiffToken[] = [];
  const diffB: DiffToken[] = [];

  let prevA = 0;
  let prevB = 0;

  for (const anchor of anchors) {
    const segA = tokensA.slice(prevA, anchor.indexA);
    const segB = tokensB.slice(prevB, anchor.indexB);
    const { a, b } = diffSegment(segA, segB);
    diffA.push(...a);
    diffB.push(...b);

    diffA.push({ text: anchor.token, type: "equal" });
    diffB.push({ text: anchor.token, type: "equal" });

    prevA = anchor.indexA + 1;
    prevB = anchor.indexB + 1;
  }

  const tailA = tokensA.slice(prevA);
  const tailB = tokensB.slice(prevB);
  const { a: ta, b: tb } = diffSegment(tailA, tailB);
  diffA.push(...ta);
  diffB.push(...tb);

  const unchanged = diffA.filter((t) => t.type === "equal").length;
  const removed = diffA.filter((t) => t.type === "delete").length;
  const added = diffB.filter((t) => t.type === "insert").length;
  const total = unchanged + removed + added;
  const similarityPct = total === 0 ? 100 : Math.round((unchanged / total) * 100);

  return {
    tokensA: diffA,
    tokensB: diffB,
    stats: { added, removed, unchanged, similarityPct },
  };
}
