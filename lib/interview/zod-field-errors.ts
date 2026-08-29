import type { ZodError, ZodIssue } from "zod";

/** Map Zod issues to CONTRACT field paths (dot paths; strip `answers.` prefix). */
export function zodInterviewErrorToFieldErrors(
  error: ZodError,
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      const keys = unrecognizedKeys(issue);
      for (const key of keys) {
        const path = normalizeFieldPath([...issue.path, key]);
        addField(fields, path, "unrecognized_key");
      }
      continue;
    }

    const path = normalizeFieldPath(issue.path);
    addField(fields, path, zodIssueToFieldCode(issue));
  }

  return fields;
}

function addField(
  fields: Record<string, string[]>,
  path: string,
  code: string,
): void {
  if (!path) {
    return;
  }
  fields[path] = [...(fields[path] ?? []), code];
}

function normalizeFieldPath(path: readonly (string | number | symbol)[]): string {
  const parts = path
    .filter((segment): segment is string | number => typeof segment !== "symbol")
    .map(String);
  if (parts[0] === "answers") {
    parts.shift();
  }
  return parts.join(".");
}

function unrecognizedKeys(issue: ZodIssue): string[] {
  if (issue.code === "unrecognized_keys" && "keys" in issue) {
    return issue.keys;
  }
  return [];
}

function zodIssueToFieldCode(issue: ZodIssue): string {
  switch (issue.code) {
    case "too_small":
      return "too_small";
    case "too_big":
      return "too_big";
    case "invalid_type":
      return "invalid_type";
    case "unrecognized_keys":
      return "unrecognized_key";
    case "invalid_enum_value":
      return "invalid_type";
    case "custom":
      return issue.message === "required" ? "required" : "invalid_type";
    default:
      return issue.code;
  }
}
