import type { ZodError } from "zod";

/** Map Zod issues to contract field error codes for the FE. */
export function zodErrorToFieldErrors(
  error: ZodError,
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") {
      continue;
    }

    const code = zodIssueToFieldCode(issue.code, issue.message);
    fields[key] = [...(fields[key] ?? []), code];
  }

  return fields;
}

function zodIssueToFieldCode(
  code: string,
  message: string,
): string {
  switch (code) {
    case "too_small":
      return "too_small";
    case "too_big":
      return "too_big";
    case "invalid_string":
      return message.includes("email") ? "invalid_format" : "invalid_format";
    case "invalid_type":
      return "invalid_type";
    case "unrecognized_keys":
      return "unrecognized_key";
    default:
      return code;
  }
}
