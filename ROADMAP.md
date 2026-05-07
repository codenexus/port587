# Port587 Roadmap

## v0.1.0-beta ✅
- SMTP and HTTP relay profiles (server-side, shared)
- Full SMTP transcript on every send
- Transaction log with transcript history (server-side, shared)
- 6 built-in email templates
- API key protection
- PWA installable
- Fly.io and Coolify deployment support

---

## v0.2.0 — Templates

### Custom Templates
- Create, name, save, edit, and delete custom templates
- Stored server-side in `./logs/templates.json` (shared across users)
- Appear in the sidebar template list alongside built-in templates
- Custom templates support the same `{date}` and `{datetime}` variable syntax

### Variable Built-in Templates
Randomize dynamic fields on each apply so repeated sends produce realistic variety:

| Template | Randomized Fields |
|----------|-------------------|
| Meeting Request | Day, time, duration |
| Password Reset | Token value |
| Support Ticket Reply | Ticket number, issue description |
| Invoice Notification | Invoice number, amount, due date, company name |
| Onboarding Welcome | Name, start time, room number |
| System Alert | Host name, metric value, current value, duration |

---

## v0.3.0 — Log Improvements
- Log pagination (currently loads all entries at once)
- Log purge / clear all
- Per-entry delete
- Filter by result (success / error), profile, or date range

---

## v1.0.0 — Polish
- Screenshots in README
- Fly.io volume persistence verified and documented
- Resolve remaining `%s` artifact in SMTP closing connection line
- PWA offline compose mode (queue sends for when connection is restored)