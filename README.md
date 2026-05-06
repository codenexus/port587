# Port587

A developer tool for testing SMTP relay and HTTP mail endpoints. Compose and send test emails through any relay, with full SMTP transcript logging and a shared transaction log for your team.

## Stack

- **Runtime**: Bun
- **Server**: Hono
- **Mail**: Nodemailer
- **Frontend**: Vanilla HTML/JS (PWA — installable)
- **Deploy**: Fly.io or Coolify

---

## Features

- Multiple named relay profiles (SMTP or HTTP), shared across all users
- Pre-built realistic email templates
- Full SMTP handshake transcript on every send
- Shared transaction log with per-send transcript history
- API key protection on all endpoints
- Installable as a PWA

---

## Local Development

### Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- pnpm — `bun install -g pnpm`
- Node (for pnpm) — install via [nvm](https://github.com/nvm-sh/nvm) or directly

### Setup

```bash
git clone https://github.com/codenexus/port587.git
cd port587
cp .env.example .env
```

Edit `.env` and set a strong `API_KEY`:

```bash
openssl rand -hex 32
# paste output into .env as API_KEY
```

### Run

```bash
pnpm install
pnpm dev
```

App runs at `http://localhost:3000`.

### Notes

- Relay profiles are stored in `./logs/profiles.json`
- Transaction logs are stored in `./logs/transactions.jsonl`
- Both persist naturally on bare metal since there's no container filesystem

---

## Fly.io Deployment

### First-time setup

Install flyctl:

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

Launch the app (use the existing `fly.toml` when prompted):

```bash
fly launch --no-deploy
```

Set your API key secret:

```bash
fly secrets set API_KEY=your_strong_key_here
```

Create a persistent volume for logs and profiles:

```bash
fly volumes create port587_logs --size 1
```

Add the volume mount to `fly.toml`:

```toml
[mounts]
  source = "port587_logs"
  destination = "/app/logs"
```

Deploy:

```bash
fly deploy
```

App will be live at `https://port587.fly.dev`.

### Subsequent deploys

```bash
fly deploy
```

Or push to GitHub if you've set up a CI/CD pipeline.

### Notes

- The dedicated IPv4 (`fly ips allocate-v4 --shared=false`, $2/mo) is recommended if sending through an IP-whitelisted M365 connector — shared IPs may be on spam blacklists
- Fly machines auto-stop when idle to save costs. They auto-start on the next request.

---

## Coolify Deployment

### Prerequisites

- A server running Coolify (see [coolify.io](https://coolify.io))
- A domain pointed at your server via an A record
- Ports 80 and 443 open inbound, ports 25, 587, 465, and 2525 open outbound for SMTP relay testing

### Setup

1. In Coolify, go to **Sources** and connect your GitHub account via a GitHub App
2. Go to **Projects** → your project → **New Resource** → **Private Repository (with GitHub App)**
3. Select `port587`, set build pack to **Dockerfile**, click **Continue**
4. Set the domain to `https://port587.yourdomain.com`
5. Go to **Environment Variables** and add `API_KEY` with a strong value:
   ```bash
   openssl rand -hex 32
   ```
6. Go to **Persistent Storage** → **Add** → **Volume Mount**:
   - **Name**: `port587-logs`
   - **Destination Path**: `/app/logs`
7. Click **Deploy**

### Subsequent deploys

Coolify auto-deploys on every push to the configured branch via webhook. No manual steps required.

### Notes

- The persistent volume ensures logs and profiles survive redeployments
- If your server has multiple WAN interfaces, pin the server's outbound traffic to the interface whose IP is whitelisted in your M365 connector — otherwise round-robin routing may send from an unexpected IP

---

## API Key

All `/api/*` endpoints require an `x-api-key` header matching the `API_KEY` environment variable.

In the browser, the app prompts for the key once per session and caches it in `sessionStorage`. Use the **API Key** button in the header to clear and re-enter it — useful when switching between environments or if the wrong key was entered.

Different deployments (local, Fly.io, Coolify) each have their own `API_KEY` — they are independent instances.

---

## Relay Profiles

Profiles are stored server-side in `./logs/profiles.json` and shared across all users of the same instance.

### SMTP Profile

| Field | Description |
|-------|-------------|
| Host | SMTP server hostname |
| Port | Typically 25 (connector relay) or 587 (authenticated) |
| Security | None, STARTTLS, or TLS/SSL |
| Username | Optional — leave blank for IP-whitelisted connectors |
| Password | Optional — leave blank for IP-whitelisted connectors |

### M365 Connector Relay (recommended setup)

| Setting | Value |
|---------|-------|
| Host | `yourdomain-com.mail.protection.outlook.com` |
| Port | `25` |
| Security | None |
| Username | leave blank |
| Password | leave blank |

The M365 connector must whitelist the outbound IP of the server running Port587. Configure this in **Exchange Admin Center** → **Mail flow** → **Connectors**.

### HTTP Profile

Posts a JSON payload to any endpoint:

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

## Transaction Log

Every send attempt is logged to `./logs/transactions.jsonl` (newline-delimited JSON). Each entry includes:

- Timestamp
- Profile used (type, host/url, port, security, username — never password)
- From, Reply-To, To, Subject
- Result (success or error)
- Message ID (on success)
- Full SMTP transcript

Access the log via the **Log** button in the app header. The log is shared across all users of the same instance and requires the API key to view.