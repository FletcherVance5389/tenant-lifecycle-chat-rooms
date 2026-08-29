import assert from "node:assert/strict";
import test from "node:test";
import type { RealtimeClient } from "../src/infrai_realtime.js";
import { AccountUnavailableError, createTenantChat } from "../src/tenant_chat.js";

test("a suspended account cannot receive a chat token", async () => {
  let tokenRequests = 0;
  const client: RealtimeClient = {
    async createChannel() {},
    async issueToken() { tokenRequests += 1; return { token: "test-token" }; },
    async publish() {},
    async getPresence() { return []; },
  };
  const chat = createTenantChat(client);

  await assert.rejects(
    chat.openSession({ tenantId: "acme-tools", accountId: "user-42", lifecycle: "suspended" }),
    AccountUnavailableError,
  );
  assert.equal(tokenRequests, 0);
});
