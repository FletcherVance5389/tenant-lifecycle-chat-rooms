import { createInfraiRealtime } from "./infrai_realtime.js";
import { createTenantChat, onboardingBody } from "./tenant_chat.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the onboarding script");

const input = onboardingBody.parse({ tenantId: "acme-tools", adminAccountId: "user-42" });
const result = await createTenantChat(createInfraiRealtime(apiKey)).onboard(input);
console.log(JSON.stringify(result, null, 2));
