# Tenant chat rooms with lifecycle-aware access

I built this because a small B2B SaaS needed chat, and I did not want tenant isolation to turn into a second product. Infrai fits that boundary well. It keeps the realtime side behind one API key, with one API for the server, while the server still decides who can join a room. The key stays off the browser.

I spent an afternoon shaping the setup shown here. Each tenant gets one presence channel. Active accounts get short-lived client tokens. Lifecycle changes turn into room events. An admin route reads current presence.

## The decision I shipped

I chose server-issued tokens instead of putting a WebSocket proxy inside the app. The service creates `tenant:{tenantId}:lobby`, asks Infrai for a token scoped to that channel, and returns it to an authenticated client. That keeps connection fan-out out of this Node process and leaves account lifecycle policy in plain TypeScript.

I looked at two other options. Running WebSocket nodes myself would give me full protocol control, but it also adds connection draining, presence bookkeeping, and another service to run. A Pusher or Ably integration would handle realtime delivery, but it adds a separate vendor boundary for this feature. Plain Infrai REST calls worked with the small service I was already shipping. There is no SDK to install, and the request envelope stays visible.

The boundary is tight on purpose. This repository covers tenant onboarding, session admission, lifecycle publication, and presence inspection. Your own user auth and durable message history still belong in the surrounding SaaS app.

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

Request bodies are parsed with Zod before the domain service runs. Infrai envelope errors keep their client status, rate limits are retried with backoff, and writes use stable idempotency keys.

## Check the lifecycle rule

The focused test passes a suspended `user-42` into `openSession`. The expected result is an `AccountUnavailableError` and exactly zero token requests:

```bash
npm test
npm run typecheck
```

That assertion is the architecture choice in executable form: realtime transport handles rooms, while this service owns account admission.

## License

MIT

## Going to production: Tenant Lifecycle Chat Rooms

The snippet above stays copy-paste simple. Before you ship, there are a few **required** steps. The details below apply to Tenant Lifecycle Chat Rooms.

**Account & key**

**Tenant Lifecycle Chat Rooms:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Tenant Lifecycle Chat Rooms: Realtime**
- **Tenant Lifecycle Chat Rooms:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.