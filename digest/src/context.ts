/**
 * Builds the shared system-prompt preamble from the reader profile. The
 * profile text is personal and comes from the DIGEST_PROFILE secret; only
 * these non-personal style rules live in the repo.
 */
const STYLE_RULES =
  "Style rules for anything you write: UK English. No em dashes. No exclamation marks. No hype language.";

export function editorialContext(profileContext: string): string {
  return `${profileContext.trim()}\n\n${STYLE_RULES}`;
}
