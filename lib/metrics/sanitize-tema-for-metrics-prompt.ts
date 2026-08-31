import "server-only";

export function sanitizeTemaForMetricsPrompt(raw: string): string | null {
  let value = raw.trim();
  if (value.length === 0) {
    return null;
  }

  value = value.replace(/[\x00-\x1F\x7F]/g, "");
  value = value.replace(/[\n\r]+/g, " ");
  value = value.replace(/[<>]/g, "");
  value = value.trim();

  if (value.length === 0) {
    return null;
  }

  if (value.length > 200) {
    value = value.slice(0, 200).trim();
  }

  return value.length > 0 ? value : null;
}
