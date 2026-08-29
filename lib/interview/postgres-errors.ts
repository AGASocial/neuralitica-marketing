type PgLikeError = {
  code?: string;
  message?: string;
} | null;

export function isUniqueViolation(error: PgLikeError): boolean {
  return error?.code === "23505";
}

export function isCheckViolation(error: PgLikeError): boolean {
  return error?.code === "23514";
}
