// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error)
}

// ── Storage keys ──
const KEY_PROFILES = 'port587_profiles'
const KEY_ACTIVE   = 'port587_active_profile'

// ── State ──
let profiles = []
let activeProfileId = null
let editingProfileId = null

// ── Templates ──
const TEMPLATES = [
  {
    icon: '📅',
    name: 'Meeting Request',
    subject: 'Meeting Request: Project Sync — {date}',
    body: `Hi,

I'd like to schedule a brief sync to discuss the current project status and upcoming milestones.

Proposed time: Thursday at 2:00 PM
Duration: 30 minutes
Location: Teams / Zoom (link to follow)

Please let me know if this works for you or suggest an alternative time.

Best regards`,
  },
  {
    icon: '🔐',
    name: 'Password Reset',
    subject: 'Password Reset Request',
    body: `Hello,

We received a request to reset the password associated with your account.

Click the link below to reset your password. This link will expire in 24 hours.

https://example.com/reset?token=abc123def456

If you did not request a password reset, please ignore this email or contact support if you have concerns.

Security Team`,
  },
  {
    icon: '🎫',
    name: 'Support Ticket Reply',
    subject: 'Re: [Ticket #48291] Issue with login',
    body: `Hello,

Thank you for reaching out to our support team.

We've reviewed your ticket regarding the login issue and have identified the cause. Our engineering team deployed a fix at 14:32 UTC today. Please clear your browser cache and attempt to log in again.

If the issue persists, please reply to this email with:
- Your browser and version
- Any error messages displayed

We apologize for the inconvenience.

Support Team`,
  },
  {
    icon: '🧾',
    name: 'Invoice Notification',
    subject: 'Invoice #INV-2024-0089 — Payment Due',
    body: `Dear Customer,

Please find attached invoice #INV-2024-0089 for services rendered in November 2024.

  Amount Due:  $1,250.00
  Due Date:    December 15, 2024
  Payment:     ACH / Wire / Check

To pay online, visit: https://billing.example.com/pay/INV-2024-0089

If you have any questions regarding this invoice, please don't hesitate to reach out.

Accounts Receivable`,
  },
  {
    icon: '👋',
    name: 'Onboarding Welcome',
    subject: 'Welcome to the team, {name}!',
    body: `Hi {name},

Welcome aboard! We're thrilled to have you join the team.

Here's what to expect on your first day:
- 9:00 AM: IT setup and equipment pickup
- 10:00 AM: HR orientation (Room 2B)
- 12:00 PM: Team lunch
- 1:30 PM: Meet with your manager

Your temporary credentials will be sent in a separate email. Please change your password on first login.

Looking forward to working with you!

People Ops`,
  },
  {
    icon: '🚨',
    name: 'System Alert',
    subject: '[ALERT] High CPU usage detected — prod-web-01',
    body: `ALERT NOTIFICATION
Severity: WARNING
Time: {datetime} UTC

Host:    prod-web-01
Metric:  CPU Usage
Value:   92.4% (threshold: 80%)
Duration: 5 minutes

Recommended actions:
1. Check running processes: top / htop
2. Review recent deployments
3. Inspect application logs

This alert will auto-resolve when the metric drops below threshold.

-- Monitoring System`,
  },
]

// ── DOM refs ──
const $ = (id) => document.getElementById(id)

const elProfileSelect  = $('profile-select')
const elProfileDetail  = $('profile-detail')
const elTemplateList   = $('template-list')
const elSendStatus     = $('send-status')
const elModalProfile   = $('modal-profile')
const elModalTitle     = $('modal-title')
const elPType          = $('p-type')
const elSmtpFields     = $('smtp-fields')
const elHttpFields     = $('http-fields')

const elFrom    = $('f-from')
const elReplyTo = $('f-replyto')
const elTo      = $('f-to')
const elSubject = $('f-subject')
const elBody    = $('f-body')

// ── Profile persistence ──
function loadProfiles() {
  try {
    profiles = JSON.parse(localStorage.getItem(KEY_PROFILES) || '[]')
    activeProfileId = localStorage.getItem(KEY_ACTIVE) || null
  } catch {
    profiles = []
  }
}

function saveProfiles() {
  localStorage.setItem(KEY_PROFILES, JSON.stringify(profiles))
  if (activeProfileId) localStorage.setItem(KEY_ACTIVE, activeProfileId)
  else localStorage.removeItem(KEY_ACTIVE)
}

function renderProfiles() {
  elProfileSelect.innerHTML = ''

  if (profiles.length === 0) {
    elProfileSelect.innerHTML = '<option value="">— no profiles —</option>'
    elProfileDetail.style.display = 'none'
    return
  }

  profiles.forEach((p) => {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = p.name
    if (p.id === activeProfileId) opt.selected = true
    elProfileSelect.appendChild(opt)
  })

  renderProfileDetail()
}

function renderProfileDetail() {
  const p = profiles.find((x) => x.id === activeProfileId)
  if (!p) { elProfileDetail.style.display = 'none'; return }

  const badge = p.type === 'smtp'
    ? `<span class="badge badge-smtp">SMTP</span>`
    : `<span class="badge badge-http">HTTP</span>`

  let rows = ''
  if (p.type === 'smtp') {
    rows = `
      <div class="kv"><span class="k">host</span><span class="v">${p.host}</span></div>
      <div class="kv"><span class="k">port</span><span class="v">${p.port}</span></div>
      <div class="kv"><span class="k">security</span><span class="v">${p.security.toUpperCase()}</span></div>
      ${p.username ? `<div class="kv"><span class="k">user</span><span class="v">${p.username}</span></div>` : ''}
    `
  } else {
    rows = `<div class="kv"><span class="k">url</span><span class="v" style="word-break:break-all">${p.url}</span></div>`
  }

  elProfileDetail.style.display = 'block'
  elProfileDetail.innerHTML = `${badge}<div style="margin-top:6px">${rows}</div>`
}

// ── Profile modal ──
function openProfileModal(editId = null) {
  editingProfileId = editId
  const p = editId ? profiles.find((x) => x.id === editId) : null

  elModalTitle.textContent = p ? 'Edit Profile' : 'New Profile'
  $('p-name').value     = p?.name || ''
  $('p-type').value     = p?.type || 'smtp'
  $('p-host').value     = p?.host || ''
  $('p-port').value     = p?.port || 587
  $('p-security').value = p?.security || 'starttls'
  $('p-username').value = p?.username || ''
  $('p-password').value = p?.password || ''
  $('p-url').value      = p?.url || ''
  $('p-auth-header').value = p?.authHeader || ''

  toggleModalType(p?.type || 'smtp')
  elModalProfile.classList.add('open')
  $('p-name').focus()
}

function closeProfileModal() {
  elModalProfile.classList.remove('open')
  editingProfileId = null
}

function toggleModalType(type) {
  elSmtpFields.className = 'smtp-fields' + (type === 'smtp' ? ' active' : '')
  elHttpFields.className = 'http-fields' + (type === 'http' ? ' active' : '')
}

function saveProfile() {
  const name = $('p-name').value.trim()
  const type = elPType.value

  if (!name) { alert('Profile name is required.'); return }

  let profile = { id: editingProfileId || crypto.randomUUID(), name, type }

  if (type === 'smtp') {
    const host = $('p-host').value.trim()
    const port = parseInt($('p-port').value, 10)
    if (!host) { alert('Host is required for SMTP profiles.'); return }
    profile = { ...profile, host, port: port || 587, security: $('p-security').value,
      username: $('p-username').value.trim(), password: $('p-password').value }
  } else {
    const url = $('p-url').value.trim()
    if (!url) { alert('URL is required for HTTP profiles.'); return }
    profile = { ...profile, url, authHeader: $('p-auth-header').value.trim() }
  }

  if (editingProfileId) {
    profiles = profiles.map((p) => p.id === editingProfileId ? profile : p)
  } else {
    profiles.push(profile)
    activeProfileId = profile.id
  }

  saveProfiles()
  renderProfiles()
  closeProfileModal()
}

function deleteProfile() {
  if (!activeProfileId) return
  const p = profiles.find((x) => x.id === activeProfileId)
  if (!p || !confirm(`Delete profile "${p.name}"?`)) return

  profiles = profiles.filter((x) => x.id !== activeProfileId)
  activeProfileId = profiles[0]?.id || null
  saveProfiles()
  renderProfiles()
}

// ── Templates ──
function renderTemplates() {
  elTemplateList.innerHTML = ''
  TEMPLATES.forEach((t, i) => {
    const el = document.createElement('div')
    el.className = 'template-item'
    el.innerHTML = `<span class="t-icon">${t.icon}</span><span>${t.name}</span>`
    el.addEventListener('click', () => applyTemplate(i))
    elTemplateList.appendChild(el)
  })
}

function applyTemplate(i) {
  const t = TEMPLATES[i]
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const datetime = new Date().toISOString().replace('T', ' ').slice(0, 19)

  elSubject.value = t.subject.replace('{date}', date).replace('{datetime}', datetime)
  elBody.value    = t.body.replace('{date}', date).replace('{datetime}', datetime)
}

// ── Clear ──
function clearCompose() {
  elFrom.value = elReplyTo.value = elTo.value = elSubject.value = elBody.value = ''
}

// ── Status ──
function setStatus(msg, type = 'idle') {
  elSendStatus.textContent = msg
  elSendStatus.className = `send-status status-${type}`
}

// ── Send ──
async function send() {
  const profile = profiles.find((x) => x.id === activeProfileId)
  if (!profile) { setStatus('no active profile selected', 'err'); return }

  const from    = elFrom.value.trim()
  const to      = elTo.value.trim()
  const subject = elSubject.value.trim()
  const body    = elBody.value.trim()

  if (!from || !to || !subject || !body) {
    setStatus('From, To, Subject, and Body are required', 'err')
    return
  }

  setStatus('sending…', 'sending')
  $('btn-send').disabled = true

  const apiKey = getApiKey()

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        profile,
        from,
        replyTo: elReplyTo.value.trim() || undefined,
        to,
        subject,
        body,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setStatus(`error: ${data.error || res.statusText}`, 'err')
    } else {
      setStatus(`sent ✓  ${data.messageId || data.response || ''}`, 'ok')
    }
  } catch (err) {
    setStatus(`request failed: ${err.message}`, 'err')
  } finally {
    $('btn-send').disabled = false
  }
}

// ── API key ──
// Read from meta tag injected by server, or fallback to env-injected window var,
// or prompt once and cache in sessionStorage for convenience during a session.
function getApiKey() {
  // If server injects window.PORT587_API_KEY via a script tag or similar, use it.
  if (window.PORT587_API_KEY) return window.PORT587_API_KEY

  // Otherwise fall back to sessionStorage prompt (dev convenience)
  let key = sessionStorage.getItem('port587_api_key')
  if (!key) {
    key = prompt('Enter API key:') || ''
    if (key) sessionStorage.setItem('port587_api_key', key)
  }
  return key
}

// ── Event wiring ──
elProfileSelect.addEventListener('change', () => {
  activeProfileId = elProfileSelect.value || null
  localStorage.setItem(KEY_ACTIVE, activeProfileId || '')
  renderProfileDetail()
})

elPType.addEventListener('change', () => toggleModalType(elPType.value))

$('btn-add-profile').addEventListener('click', () => openProfileModal())
$('btn-edit-profile').addEventListener('click', () => {
  if (activeProfileId) openProfileModal(activeProfileId)
})
$('btn-delete-profile').addEventListener('click', deleteProfile)
$('btn-modal-cancel').addEventListener('click', closeProfileModal)
$('btn-modal-save').addEventListener('click', saveProfile)
$('btn-clear').addEventListener('click', clearCompose)
$('btn-send').addEventListener('click', send)

// Close modal on backdrop click
elModalProfile.addEventListener('click', (e) => {
  if (e.target === elModalProfile) closeProfileModal()
})

// ── Init ──
loadProfiles()
renderProfiles()
renderTemplates()
