import { describe, expect, it, vi } from "vitest";
import {
  createWebhookSender,
  WebhookSenderError,
  type WebhookFetch,
} from "../../../worker/webhook-sender";

const request = {
  url: "https://example.com/webhooks",
  body: '{"eventId":"event-1"}',
  headers: {
    "content-type": "application/json",
    "x-relay-signature": "sha256=signature",
  },
};

describe("webhook sender", () => {
  it("sends a POST request and returns the response status", async () => {
    const fetchImpl = vi.fn<WebhookFetch>(async () =>
      new Response(null, { status: 202 }),
    );
    const sendWebhook = createWebhookSender({
      timeoutMs: 1_000,
      fetchImpl,
    });

    const result = await sendWebhook(request);

    expect(result).toEqual({ status: 202 });
    expect(fetchImpl).toHaveBeenCalledWith(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: expect.any(AbortSignal),
    });
  });

  it("converts a fetch rejection into a stable network error", async () => {
    const fetchImpl = vi.fn<WebhookFetch>(async () => {
      throw new Error("private network details");
    });
    const sendWebhook = createWebhookSender({
      timeoutMs: 1_000,
      fetchImpl,
    });

    const promise = sendWebhook(request);

    await expect(promise).rejects.toEqual(
      new WebhookSenderError("NETWORK_ERROR"),
    );
  });

  it("aborts and reports a timeout", async () => {
    const fetchImpl = vi.fn<WebhookFetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const sendWebhook = createWebhookSender({
      timeoutMs: 5,
      fetchImpl,
    });

    await expect(sendWebhook(request)).rejects.toEqual(
      new WebhookSenderError("TIMEOUT"),
    );
  });

  it("rejects an invalid timeout during setup", () => {
    expect(() =>
      createWebhookSender({
        timeoutMs: 0,
      }),
    ).toThrow("Webhook timeout must be a positive integer");
  });
});
