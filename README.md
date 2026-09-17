# Commercial Roofing Estimator

Instant AI-powered commercial roof estimation. Contractors capture leads, roofs
are assessed from photos by an AI vision model, and prospects get a professional
price band in under a minute.

This is a **standalone, runnable** implementation (React + Vite frontend, local
Express backend). It re-creates the security-hardened flow originally specced for
the Base44 platform, without needing Base44.

## Stack

- **Frontend:** React 18, Vite, React Router, TanStack Query, Tailwind CSS, lucide-react, Sonner toasts.
- **Backend:** Node + Express. JSON-file persistence (`server/data/`), local photo storage (`server/uploads/`).
- **AI:** Claude vision (`@anthropic-ai/sdk`) for roof analysis, with a deterministic offline mock fallback.

## Quick start

```bash
npm install
cp .env.example .env      # optional — the app runs without any keys
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:8787 (Vite proxies `/api` and `/uploads`)

**Two audiences:**

- **Customers** requesting an estimate never sign in — they just fill out the
  public form on the home page and get an instant price band.
- **Companies / contractors** create an account (company name, email, short
  description) or sign in. After signing in they land on the **Dashboard**,
  which lists incoming requests. A request the account hasn't opened yet shows a
  blue dot in its top-right corner; opening it clears the dot. **Company
  logistics** holds pricing rules, service area, and notification settings.

### Production build

```bash
npm run build
npm start           # serves the built SPA + API from :8787
```

## AI vision

Set `ANTHROPIC_API_KEY` in `.env` to use live Claude vision analysis
(`ROOF_MODEL`, default `claude-opus-5`). Without a key the backend uses a
deterministic mock analyzer so everything stays fully runnable offline. Either
way, every model field is re-validated against strict enum allow-lists before it
touches the database — the model is never trusted.

## Email — deferred

Email/Gmail sending is intentionally **turned off** for now (`EMAIL_ENABLED` in
`server/email.js`). The validation/sanitization helpers and Resend/default
provider branches are in place and ready to switch on later. Until then estimates
are computed and stored, and `email_sent` / `contractor_notified` stay `false`.

## Security highlights (implemented)

- **SSRF-safe photos:** base64 data URLs are strictly validated (regex + mime
  allow-list + 8 MB cap) and decoded in memory — user URLs are never fetched.
- **LLM output hardening:** every field re-validated against enums with safe
  fallbacks; `estimated_life_years` clamped 0–40; the prompt tells the model to
  treat in-image text as untrusted.
- **Email injection prevention:** RFC-5321-ish address validation and a
  `sanitizeText` that strips control chars (incl. CR/LF), HTML, URLs, emails and
  off-allow-list characters. Only validated enums/numbers + sanitized fields are
  templated.
- **Authorization:** requesting an estimate is public (customers don't sign in)
  with per-IP rate limiting; the estimate's UUID acts as a capability token for
  its confirmation page. Company routes (leads, logistics) require an
  authenticated company account, HMAC-token gated on the server and guarded by
  `<RequireAuth>` on the client.
- **Error sanitization:** third-party provider errors are logged server-side and
  never surfaced to the client.

## Project layout

```
server/           Express API
  index.js        routes + orchestration (processEstimationRequest)
  llm.js          Claude vision analysis + validated fallback
  security.js     validation, sanitization, SSRF-safe decode, rate limiter
  auth.js         HMAC-signed account tokens
  email.js        deferred email (helpers + templates ready)
  store.js        JSON persistence (accounts + EstimationRequest + AppSettings)
src/              React app (pages/, components/, auth/, lib/)
```
