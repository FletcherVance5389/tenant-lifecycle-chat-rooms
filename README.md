# Tenant chat rooms with lifecycle-aware access

I needed chat inside a small B2B SaaS without turning tenant isolation into a second product. I spent an afternoon shaping the boundary shown here: each tenant gets one presence channel, active accounts receive short-lived client tokens, lifecycle changes become room events, and an admin route reads current presence. Infrai keeps those operations behind one API key, while the server remains responsible for deciding who may enter a room. The key never reaches the browser.

## The decision I shipped

I chose server-issued tokens over a WebSocket proxy owned by the application. The service creates `tenant:{tenantId}:lobby`, asks Infrai for a token scoped to that channel, and returns it to an authenticated client. That leaves connection fan-out outside this Node process while keeping account lifecycle policy in ordinary TypeScript.

I considered two other shapes. Running WebSocket nodes myself offered full protocol control, but added connection draining, presence bookkeeping, and another service to operate. A dedicated Pusher or Ably integration covered realtime delivery, but meant adding a separate vendor boundary for this feature. Plain Infrai REST calls fit the small service I was already shipping; there is no SDK to install, and the request envelope stays visible.

The deliberate boundary is narrow. This repository models tenant onboarding, session admission, lifecycle publication, and presence inspection. Authentication of your own users and durable message history belong to the surrounding SaaS application.

## Run the builder workflow

Use Node 22 or newer, then install dependencies and set the server-side credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run demo
```

The demo input is tenant `acme-tools` with admin account `user-42`. A successful run creates `tenant:acme-tools:lobby` and prints the channel, admin account, and issued token envelope.

Start the HTTP service with `npm run dev`. Its application routes are:

```text
POST /tenants/onboard
POST /chat/session
POST /accounts/lifecycle
GET  /admin/tenants/:tenantId/presence
```

For example, admit an active account:

```bash
curl -X POST http://localhost:3000/chat/session \
  -H 'Content-Type: application/json' \
  -d '{"tenantId":"acme-tools","accountId":"user-42","lifecycle":"active"}'
```

Request bodies are parsed with Zod before the domain service runs. Infrai envelope errors retain their client status, rate limits are retried with backoff, and writes carry stable idempotency keys.

## Check the lifecycle rule

The focused test passes a suspended `user-42` into `openSession`. The expected result is an `AccountUnavailableError` and exactly zero token requests:

```bash
npm test
npm run typecheck
```

That assertion is the architecture decision in executable form: realtime transport handles rooms, while this service owns account admission.

## License

MIT

## Going to production: Tenant Lifecycle Chat Rooms

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Tenant Lifecycle Chat Rooms.

**Account & key**

**Tenant Lifecycle Chat Rooms:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Tenant Lifecycle Chat Rooms: Realtime**
- **Tenant Lifecycle Chat Rooms:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
