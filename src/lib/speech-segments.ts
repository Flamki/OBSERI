/** Wait for natural phrasing instead of cutting a sentence every ~70 characters. */
export function findSpeechBoundary(text: string) {
  const sentenceEnds = /[.!?。！？](?:["'”’\])]*)(?:\s+|(?=[\u3000-\u9fff]))/g;
  for (const match of text.matchAll(sentenceEnds)) {
    const end = match.index! + match[0].length;
    if (end < 20) continue;
    const preceding = text.slice(0, match.index! + 1);
    if (/(?:\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc)|\b[A-Z])\.$/i.test(preceding)) continue;
    return end;
  }
  // Bound unusually long sentences, preferring a clause boundary first.
  if (text.length < 240) return -1;
  const clause = text.slice(100, 240).match(/[,;:]\s+/);
  if (clause) return 100 + clause.index! + clause[0].length;
  if (text.length < 320) return -1;
  const space = text.lastIndexOf(" ", 320);
  return space >= 100 ? space + 1 : 320;
}
