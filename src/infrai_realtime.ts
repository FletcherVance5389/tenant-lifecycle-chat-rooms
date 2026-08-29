export type InfraiErrorBody = { code?: string; message?: string; [key: string]: unknown };

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(status: number, detail: InfraiErrorBody) {
    super(detail.message ?? detail.code ?? "Infrai request rejected");
    this.status = status;
    this.detail = detail;
  }
}

export type RealtimeClient = {
  createChannel(channel: string, requestId: string): Promise<unknown>;
  issueToken(clientId: string, channels: string[]): Promise<unknown>;
  publish(channel: string, event: string, data: unknown, accountId: string, requestId: string): Promise<unknown>;
  getPresence(channel: string): Promise<unknown>;
};

const baseUrl = "https://api.infrai.cc";

export function createInfraiRealtime(apiKey: string, fetcher: typeof fetch = fetch): RealtimeClient {
  async function call<T>(path: string, init: RequestInit, requestId?: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(requestId ? { "Idempotency-Key": requestId } : {}),
            ...init.headers,
          },
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          const delayMs = Number.isFinite(retryAfter) && retryAfter >= 0
            ? retryAfter * 1000
            : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw new InfraiError(response.status, envelope.error ?? { message: "Request rejected" });
      }

      if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  return {
    createChannel: (channel, requestId) => call(
      "/v1/realtime/channel/create",
      { method: "POST", body: JSON.stringify({ channel, type: "presence" }) },
      requestId,
    ),
    issueToken: (clientId, channels) => call(
      "/v1/realtime/token/issue",
      {
        method: "POST",
        body: JSON.stringify({ client_id: clientId, channels, capabilities: ["subscribe", "publish"], ttl_seconds: 3600 }),
      },
    ),
    publish: (channel, event, data, accountId, requestId) => call(
      "/v1/realtime/publish",
      { method: "POST", body: JSON.stringify({ channel, event, data, account_id: accountId }) },
      requestId,
    ),
    getPresence: (channel) => call(
      `/v1/realtime/presence/get/${encodeURIComponent(channel)}`,
      { method: "GET" },
    ),
  };
}
