import "server-only";

/**
 * Deterministic generic-avatar-not-owner QA check (US-3.4 stub).
 *
 * US-10.1 MUST import evaluateGenericAvatarNotOwnerCheck,
 * GENERIC_AVATAR_NOT_OWNER_CHECK_KEY, and QA_CHECK_SEVERITY.blocking.
 * US-10.2 MUST reject override for this checkKey (blocking legal class).
 *
 * Adjacency (V1): when an owner-claim is detected, a disclosure pass phrase
 * must appear in the same paragraph (split on \\n\\n) OR within 120 characters
 * before/after the match — whichever is more permissive for pass.
 */

import {
  GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
  type GenericAvatarNotOwnerCheckInput,
  type GenericAvatarNotOwnerCheckResult,
} from "@/lib/contracts/qa";
import { QA_CHECK_SEVERITY } from "@/lib/qa/check-classes";

export { GENERIC_AVATAR_NOT_OWNER_CHECK_KEY };

const DISCLOSURE_PASS_PHRASES = [
  "not the business owner",
  "ai presenter",
  "presenter is not",
  "not the owner of this business",
  "no es el dueño",
  "no es la dueña",
  "presentador de ia",
  "presentador no es el dueño",
  "presentadora no es la dueña",
] as const;

const ADJACENCY_WINDOW_CHARS = 120;

const FAIL_MESSAGE_KEY = "qa.checks.genericAvatarNotOwner.failOwnerClaim";

type OwnerClaimMatch = {
  index: number;
  length: number;
  phrase: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildOwnerClaimPatterns(ownerDisplayName?: string): RegExp[] {
  const patterns: RegExp[] = [
    /\bI am the owner\b/i,
    /\bI'm the owner\b/i,
    /\bsoy el dueño\b/i,
    /\bsoy la dueña\b/i,
  ];

  const trimmedOwner = ownerDisplayName?.trim();
  if (trimmedOwner && trimmedOwner.length >= 2) {
    const escaped = escapeRegex(trimmedOwner);
    patterns.push(new RegExp(`\\bI am ${escaped}\\b`, "i"));
    patterns.push(new RegExp(`\\bI'm ${escaped}\\b`, "i"));
    patterns.push(new RegExp(`\\byo soy ${escaped}\\b`, "i"));
    patterns.push(new RegExp(`\\bsoy ${escaped}\\b`, "i"));
  }

  return patterns;
}

function findOwnerClaimMatches(
  scriptText: string,
  ownerDisplayName?: string,
): OwnerClaimMatch[] {
  const matches: OwnerClaimMatch[] = [];
  const patterns = buildOwnerClaimPatterns(ownerDisplayName);

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(scriptText)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        phrase: match[0],
      });
    }
  }

  const sentenceRegex = /[^.!?]+[.!?]?/g;
  let sentenceMatch: RegExpExecArray | null;
  while ((sentenceMatch = sentenceRegex.exec(scriptText)) !== null) {
    const sentence = sentenceMatch[0];
    if (!/\bmy business\b/i.test(sentence)) {
      continue;
    }
    if (!/\b(I'm|I am)\b/i.test(sentence)) {
      continue;
    }
    matches.push({
      index: sentenceMatch.index,
      length: sentence.length,
      phrase: sentence.trim(),
    });
  }

  matches.sort((a, b) => a.index - b.index);
  return matches;
}

function paragraphBounds(scriptText: string, index: number): [number, number] {
  const paragraphs = scriptText.split(/\n\n/);
  let offset = 0;
  for (const paragraph of paragraphs) {
    const start = offset;
    const end = offset + paragraph.length;
    if (index >= start && index <= end) {
      return [start, end];
    }
    offset = end + 2;
  }
  return [0, scriptText.length];
}

function hasDisclosureNearClaim(
  scriptText: string,
  claim: OwnerClaimMatch,
): boolean {
  const lowerScript = scriptText.toLowerCase();
  const [paragraphStart, paragraphEnd] = paragraphBounds(
    scriptText,
    claim.index,
  );
  const windowStart = Math.max(0, claim.index - ADJACENCY_WINDOW_CHARS);
  const windowEnd = Math.min(
    scriptText.length,
    claim.index + claim.length + ADJACENCY_WINDOW_CHARS,
  );

  for (const phrase of DISCLOSURE_PASS_PHRASES) {
    const lowerPhrase = phrase.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < lowerScript.length) {
      const foundAt = lowerScript.indexOf(lowerPhrase, searchFrom);
      if (foundAt === -1) {
        break;
      }
      const inParagraph =
        foundAt >= paragraphStart && foundAt <= paragraphEnd;
      const inWindow = foundAt >= windowStart && foundAt <= windowEnd;
      if (inParagraph || inWindow) {
        return true;
      }
      searchFrom = foundAt + lowerPhrase.length;
    }
  }

  return false;
}

function passResult(): GenericAvatarNotOwnerCheckResult {
  return {
    checkKey: GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
    status: "pass",
    severity: QA_CHECK_SEVERITY.blocking,
  };
}

function failResult(matchedPhrase?: string): GenericAvatarNotOwnerCheckResult {
  return {
    checkKey: GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
    status: "fail",
    severity: QA_CHECK_SEVERITY.blocking,
    evidence: {
      messageKey: FAIL_MESSAGE_KEY,
      ...(matchedPhrase ? { matchedPhrase } : {}),
    },
  };
}

export function evaluateGenericAvatarNotOwnerCheck(
  input: GenericAvatarNotOwnerCheckInput,
): GenericAvatarNotOwnerCheckResult {
  if (!input.mustDiscloseNotOwner) {
    return passResult();
  }

  const claims = findOwnerClaimMatches(
    input.scriptText,
    input.ownerDisplayName,
  );
  if (claims.length === 0) {
    return passResult();
  }

  for (const claim of claims) {
    if (!hasDisclosureNearClaim(input.scriptText, claim)) {
      return failResult(claim.phrase);
    }
  }

  return passResult();
}
