import "server-only";

export function normalizeTemaKey(rawTema: string): string {
  return rawTema.trim().toLowerCase();
}
