import "server-only";

import type { ChangeRequestInput } from "@/lib/contracts/approval-revision";
import {
  revisionContextSchema,
  UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG,
  type RevisionContext,
} from "@/lib/contracts/approval-revision";

export function wrapUntrustedChangeRequestNote(payload: string): string {
  return `<${UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG}>\n${payload}\n</${UNTRUSTED_CLIENT_CHANGE_REQUEST_TAG}>`;
}

export function buildRevisionContext(params: {
  approvalId: string;
  round: number;
  changeRequest: ChangeRequestInput;
}): RevisionContext {
  const delimitedNotesByTag: RevisionContext["delimitedNotesByTag"] = {};

  if (params.changeRequest.notesByTag) {
    for (const tag of params.changeRequest.tags) {
      const note = params.changeRequest.notesByTag[tag];
      if (note && note.trim().length > 0) {
        delimitedNotesByTag[tag] = wrapUntrustedChangeRequestNote(note.trim());
      }
    }
  }

  return revisionContextSchema.parse({
    approvalId: params.approvalId,
    round: params.round,
    tags: params.changeRequest.tags,
    delimitedNotesByTag:
      Object.keys(delimitedNotesByTag).length > 0
        ? delimitedNotesByTag
        : undefined,
    delimitedSummary: params.changeRequest.summary
      ? wrapUntrustedChangeRequestNote(params.changeRequest.summary)
      : undefined,
  });
}
