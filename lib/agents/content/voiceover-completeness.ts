/**
 * Voiceover completeness — ensure spoken copy ends in a finished sentence.
 * Root cause of prod truncation "Recuerda, yo soy": LLM returned schema-valid
 * JSON whose voiceoverText stopped mid-CTA; no max_tokens + no sentence check.
 */

const SENTENCE_END_RE = /[.!?…」』』】）)\]]\s*["'”’)]*\s*$/u;

/** True when trimmed text ends with sentence-final punctuation. */
export function voiceoverEndsWithCompleteSentence(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return SENTENCE_END_RE.test(trimmed);
}

/**
 * Reject mid-sentence cutoffs that look like unfinished CTAs / self-intros.
 * e.g. "Recuerda, yo soy" / "Remember, I am"
 */
export function looksLikeTruncatedVoiceoverTail(text: string): boolean {
  const trimmed = text.trim();
  if (voiceoverEndsWithCompleteSentence(trimmed)) {
    return false;
  }
  const midClause =
    /(?:\byo soy\b|\bi am\b|\bremember[, ]|\brecuerda[, ]|\bsoy\b|\bwe are\b|\bsomos\b)\s*$/i;
  if (midClause.test(trimmed)) {
    return true;
  }
  // Ends on a coordinating conjunction / trailing comma → incomplete.
  if (/[,:;]\s*$/.test(trimmed) || /\b(y|and|or|o|pero|but|que|that)\s*$/i.test(trimmed)) {
    return true;
  }
  return !voiceoverEndsWithCompleteSentence(trimmed);
}

export function assertVoiceoverCompleteOrThrow(voiceoverText: string): void {
  if (looksLikeTruncatedVoiceoverTail(voiceoverText)) {
    throw new Error("VOICEOVER_INCOMPLETE_SENTENCE");
  }
}
