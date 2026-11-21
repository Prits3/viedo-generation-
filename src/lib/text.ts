// Text normalisation shared by the verifier, the upload pipeline and the PDF viewer.
// PDF text layers differ in ligatures, hyphenation and spacing; quotes are compared
// on a canonical form that keeps only letters and digits.

const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ß": "ss",
};

/** Canonical form: lower-case letters and digits only. */
export function canon(input: string): string {
  let s = input.replace(/[ﬀ-ﬄß]/g, (c) => LIGATURES[c] ?? c);
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Canonical form plus a map from each canonical character back to the index
 * of the source character it came from (used to place highlights).
 */
export function canonWithMap(input: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = canon(input[i]);
    for (let k = 0; k < c.length; k++) {
      text += c[k];
      map.push(i);
    }
  }
  return { text, map };
}

export function quoteFound(pageText: string, quote: string): boolean {
  const q = canon(quote);
  return q.length >= 8 && canon(pageText).includes(q);
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Estimated speaking time for a caption when no recording exists. */
export function estimateSeconds(s: string): number {
  return Math.max(2.4, wordCount(s) / 2.6 + 0.5);
}
