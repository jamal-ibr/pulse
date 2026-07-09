import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Configure webhook URLs before the module under test loads its config.
process.env.MAKE_LEAD_WEBHOOK_URL = "https://hook.make.test/lead";
process.env.MAKE_BOOKING_WEBHOOK_URL = "";

const { postToMake, sendLeadToMake } = await import("../make/makeClient.js");

describe("makeClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("posts payload and resolves true on 200", async () => {
    // Arrange
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response("ok", { status: 200 }));
    // Act
    const delivered = await sendLeadToMake({ callId: "abc", name: "Sophie" });
    // Assert
    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hook.make.test/lead");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.callId).toBe("abc");
    expect(body._meta.webhook).toBe("lead");
  });

  test("returns false without calling fetch when URL is unset", async () => {
    const fetchMock = vi.mocked(fetch);
    const delivered = await postToMake("booking", { callId: "abc" });
    expect(delivered).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("retries on 5xx then succeeds", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const delivered = await postToMake("lead", { callId: "abc" });
    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not retry on 4xx", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 404 }));
    const delivered = await postToMake("lead", { callId: "abc" });
    expect(delivered).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("never throws on network failure, resolves false after retries", async () => {
    const fetchMock = vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));
    const delivered = await postToMake("lead", { callId: "abc" });
    expect(delivered).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);
});
