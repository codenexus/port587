# Port587

A developer tool for testing SMTP relay and HTTP mail endpoints. Installable as a PWA.

## Stack

- **Runtime**: Bun
- **Server**: Hono
- **Mail**: Nodemailer
- **Frontend**: Vanilla HTML/JS (PWA)
- **Deploy**: Fly.io

---

## Local Development

### 1. Install dependencies

```bash
pnpm install
# or: bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set a strong `API_KEY`.

### 3. Start dev server

```bash
pnpm dev
# or: bun run --watch src/index.ts
```

App runs at `http://localhost:3000`.

---

## Fly.io Deployment

### 1. Install flyctl

```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Authenticate

```bash
fly auth login
```

### 3. Launch (first time only)

```bash
fly launch --no-deploy
```

When prompted, use the existing `fly.toml` rather than generating a new one.

### 4. Set secrets

```bash
fly secrets set API_KEY=your_strong_key_here
```

### 5. Deploy

```bash
fly deploy
```

App will be live at `https://port587.fly.dev`.

---

## API Key

The `/api/send` endpoint requires an `x-api-key` header matching the `API_KEY` env var.

In the browser, if `window.PORT587_API_KEY` is not set (it isn't by default), the app will prompt once per session and cache the key in `sessionStorage`.

---

## Profile Types

### SMTP
Configure host, port, security (STARTTLS / TLS / None), and optional credentials. Works with M365, Gmail relay, Postfix, etc.

### HTTP
POST JSON payload to any endpoint. Payload format:
```json
{
  "from": "...",
  "replyTo": "...",
  "to": "...",
  "subject": "...",
  "body": "..."
}
```

---

## M365 Relay Notes

For Microsoft 365 SMTP relay (direct send or authenticated):

| Setting   | Value                        |
|-----------|------------------------------|
| Host      | smtp.office365.com           |
| Port      | 587                          |
| Security  | STARTTLS                     |
| Username  | your M365 UPN                |
| Password  | app password or account pass |

For unauthenticated relay through a connector, omit username/password and configure the connector to allow your server's IP.
