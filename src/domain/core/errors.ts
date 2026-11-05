// ドメイン層のエラー。画面や MCP では message をそのまま利用者に見せてよい。
export type DomainErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "invalid"
  | "expired";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (message: string) => new DomainError("not_found", message);
export const forbidden = (message: string) => new DomainError("forbidden", message);
export const conflict = (message: string) => new DomainError("conflict", message);
export const invalid = (message: string) => new DomainError("invalid", message);

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

/**
 * DB の制約の違反かどうか。Drizzle はエラーを包むので、cause の中の pg のエラーも見る。
 * 例: isConstraintViolation(e, "reservations_no_overlap")
 */
export function isConstraintViolation(e: unknown, constraint: string): boolean {
  for (let cur: unknown = e; cur && typeof cur === "object"; cur = (cur as { cause?: unknown }).cause) {
    if ((cur as { constraint?: unknown }).constraint === constraint) return true;
  }
  return false;
}
