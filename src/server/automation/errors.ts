import { NextResponse } from "next/server";

/**
 * Stable, machine-readable error codes for the automation API.
 *
 * n8n branches on these strings, so treat them as a public contract: add new
 * codes freely, never rename or repurpose an existing one. The human `message`
 * may change at any time; the `code` may not.
 */
export const ERROR_CODES = {
  unauthorized: 401,
  invalid_api_key: 401,
  feature_disabled: 403,
  scope_denied: 403,
  not_found: 404,
  idempotency_key_required: 400,
  idempotency_key_reused: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

/** Build a JSON error response with the canonical status for the code. */
export function apiError(
  code: ErrorCode,
  message: string,
  opts?: { details?: unknown; headers?: Record<string, string> },
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, ...(opts?.details ? { details: opts.details } : {}) } },
    { status: ERROR_CODES[code], headers: opts?.headers },
  );
}

// redactSecrets lives in ./primitives (pure, unit-tested there). Re-exported
// so route code has a single import site for the error-handling surface.
export { redactSecrets } from "@/server/automation/primitives";
