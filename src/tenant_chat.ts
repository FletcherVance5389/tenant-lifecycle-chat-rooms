import { z } from "zod";
import type { RealtimeClient } from "./infrai_realtime.js";

export const onboardingBody = z.object({
  tenantId: z.string().min(2).regex(/^[a-z0-9-]+$/),
  adminAccountId: z.string().min(1),
});

export const sessionBody = z.object({
  tenantId: z.string().min(2).regex(/^[a-z0-9-]+$/),
  accountId: z.string().min(1),
  lifecycle: z.enum(["active", "suspended", "closed"]),
});

export class AccountUnavailableError extends Error {}

export function tenantChannel(tenantId: string): string {
  return `tenant:${tenantId}:lobby`;
}

export function createTenantChat(client: RealtimeClient) {
  return {
    async onboard(input: z.infer<typeof onboardingBody>) {
      const channel = tenantChannel(input.tenantId);
      await client.createChannel(channel, `onboard-${input.tenantId}`);
      const token = await client.issueToken(input.adminAccountId, [channel]);
      return { tenantId: input.tenantId, channel, adminAccountId: input.adminAccountId, token };
    },

    async openSession(input: z.infer<typeof sessionBody>) {
      if (input.lifecycle !== "active") {
        throw new AccountUnavailableError(`Account lifecycle is ${input.lifecycle}`);
      }
      const channel = tenantChannel(input.tenantId);
      const token = await client.issueToken(input.accountId, [channel]);
      return { channel, accountId: input.accountId, token };
    },

    async recordLifecycle(input: z.infer<typeof sessionBody>) {
      const channel = tenantChannel(input.tenantId);
      await client.publish(
        channel,
        "account.lifecycle.changed",
        { lifecycle: input.lifecycle },
        input.accountId,
        `lifecycle-${input.tenantId}-${input.accountId}-${input.lifecycle}`,
      );
      return { channel, accountId: input.accountId, lifecycle: input.lifecycle };
    },

    async inspectRoom(tenantId: string) {
      const channel = tenantChannel(tenantId);
      return { channel, presence: await client.getPresence(channel) };
    },
  };
}
