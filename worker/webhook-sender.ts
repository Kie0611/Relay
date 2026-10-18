import type {
  WebhookRequest,
  WebhookResponse,
  WebhookSender,
} from "./delivery-processor";

export type WebhookSenderErrorCode =
  | "TIMEOUT"
  | "NETWORK_ERROR";

export class WebhookSenderError extends Error {
  constructor(public readonly code: WebhookSenderErrorCode) {
    super(code);
    this.name = "WebhookSenderError";
  }
}

export type WebhookFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type WebhookSenderOptions = {
  timeoutMs: number;
  fetchImpl?: WebhookFetch;
};

export function createWebhookSender(
  options: WebhookSenderOptions,
): WebhookSender {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Webhook timeout must be a positive integer");
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request: WebhookRequest): Promise<WebhookResponse> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);

    try {
      const response = await fetchImpl(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });

      return {
        status: response.status,
      };
    } catch {
      if (controller.signal.aborted) {
        throw new WebhookSenderError("TIMEOUT");
      }

      throw new WebhookSenderError("NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
    }
  };
}
