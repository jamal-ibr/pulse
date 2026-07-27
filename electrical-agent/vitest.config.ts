import { defineConfig } from "vitest/config";

/**
 * Deterministic environment for tests.
 *
 * Without this the suite silently inherits whatever is in a local .env,
 * so tests passed on a machine that happened to have one and failed
 * everywhere else - including CI. Values here are fixtures, never real.
 */
export default defineConfig({
  test: {
    env: {
      BUSINESS_NAME: "Test Electrical",
      OWNER_NAME: "Idris",
      OWNER_TRANSFER_NUMBER: "+447700900123",
      RETELL_FROM_NUMBER: "+441234567890",
      RETELL_API_KEY: "test-key-not-real",
      TRANSFER_WORKING_HOURS_ONLY: "false",
    },
  },
});
