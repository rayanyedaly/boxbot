// evals/retry.ts
//
// Telling infrastructure noise apart from agent failure. A rate limit or an overloaded
// API says nothing about the agent; a 400 from a malformed request the agent built does.

import Anthropic from "@anthropic-ai/sdk";

// Error types the API sends inside an already-open stream (SSE `event: error`). The SDK
// throws those as an APIError with NO status, so status alone can't classify them.
const TRANSIENT_STREAM_TYPES = new Set(["overloaded_error", "api_error", "rate_limit_error", "timeout_error"]);

/** Transient API/network errors worth retrying (the SDK has already retried what it could). */
export function isTransientApiError(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIError) {
    if (err.status === undefined) return TRANSIENT_STREAM_TYPES.has(err.type ?? "");
    return err.status >= 500;
  }
  // A socket dropped mid-stream: MessageStream wraps the network TypeError in a plain
  // AnthropicError with the original as `cause`.
  if (err instanceof Anthropic.AnthropicError) return (err as { cause?: unknown }).cause instanceof TypeError;
  return false;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
