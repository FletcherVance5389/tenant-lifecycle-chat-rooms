import { createServer, type ServerResponse } from "node:http";
import { ZodError, z } from "zod";
import { createInfraiRealtime, InfraiError } from "./infrai_realtime.js";
import { AccountUnavailableError, createTenantChat, onboardingBody, sessionBody } from "./tenant_chat.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const chat = createTenantChat(createInfraiRealtime(apiKey));

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "POST" && url.pathname === "/tenants/onboard") {
      return json(response, 201, await chat.onboard(onboardingBody.parse(await readBody(request))));
    }
    if (request.method === "POST" && url.pathname === "/chat/session") {
      return json(response, 200, await chat.openSession(sessionBody.parse(await readBody(request))));
    }
    if (request.method === "POST" && url.pathname === "/accounts/lifecycle") {
      return json(response, 200, await chat.recordLifecycle(sessionBody.parse(await readBody(request))));
    }
    const match = url.pathname.match(/^\/admin\/tenants\/([^/]+)\/presence$/);
    if (request.method === "GET" && match) {
      return json(response, 200, await chat.inspectRoom(z.string().min(2).parse(decodeURIComponent(match[1]))));
    }
    return json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 400, { error: "Invalid request", issues: error.issues });
    if (error instanceof AccountUnavailableError) return json(response, 409, { error: error.message });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.message, detail: error.detail });
    }
    return json(response, 500, { error: "Service request failed" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Tenant chat service listening on http://localhost:${process.env.PORT ?? 3000}`);
});
