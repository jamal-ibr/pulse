/**
 * Bumped by hand whenever behaviour changes, and surfaced on /health.
 *
 * Exists because three rounds of escalation fixes appeared to have no
 * effect on live calls, and there was no way to tell from the outside
 * whether the deployment was actually running the new code. If /health
 * does not show the tag you expect, the deploy has not landed - fix that
 * before debugging anything else.
 */
export const BUILD_TAG = "2026-07-27-retell-hints-v7";
