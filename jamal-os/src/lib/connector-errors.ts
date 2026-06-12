// Connector OAuth callbacks redirect back with ?error=<code>. Only
// these known codes are ever rendered; anything else gets the generic
// message, so arbitrary query strings never reach the page.

const MESSAGES: Record<string, string> = {
  not_configured: "the connector env vars are missing from .env.local",
  state_mismatch: "the sign-in state check failed; start the flow again",
  token_exchange_failed: "exchanging the sign-in code failed; check the client ID and secret",
};

export function connectorErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? "an unknown error occurred";
}
