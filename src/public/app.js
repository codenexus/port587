// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error)
}

// ── Storage keys ──
const KEY_ACTIVE = 'port587_active_profile'

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

// ── API helpers ──
function getApiKey() {
  if (window.PORT587_API_KEY) return window.PORT587_API_KEY
  let key = sessionStorage.getItem('port587_api_key')
  if (!key) {
    key = prompt('Enter API key:') || ''
    if (key) sessionStorage.setItem('port587_api_key', key)
  }
  return key
}

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
  }
}

// ── Profile API ──
async function fetchProfiles() {
  const res = await fetch('/api/profiles', { headers: apiHeaders() })
  const data = await res.json()
  return data.profiles || []
}

async function createProfile(profile) {
  const res = await fetch('/api/profiles', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(profile),
  })
  return res.json()
}

async function updateProfile(id, profile) {
  const res = await fetch(`/api/profiles/${id}`, {
    method: 'PUT',
    headers: apiHeaders(),
    body: JSON.stringify(profile),
  })
  return res.json()
}

async function deleteProfileApi(id) {
  await fetch(`/api/profiles/${id}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  })
}

// ── Profile UI ──
async function loadProfiles() {
  try {
    profiles = await fetchProfiles()
    activeProfileId = localStorage.getItem(KEY_ACTIVE) || null
    // If saved active ID no longer exists, clear it
    if (activeProfileId && !profiles.find((p) => p.id === activeProfileId)) {
      activeProfileId = null
      localStorage.removeItem(KEY_ACTIVE)
    }
  } catch {
    profiles = []
  }
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
  $('p-name').value        = p?.name || ''
  $('p-type').value        = p?.type || 'smtp'
  $('p-host').value        = p?.host || ''
  $('p-port').value        = p?.port || 587
  $('p-security').value    = p?.security || 'starttls'
  $('p-username').value    = p?.username || ''
  $('p-password').value    = p?.password || ''
  $('p-url').value         = p?.url || ''
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

async function saveProfile() {
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
    await updateProfile(editingProfileId, profile)
  } else {
    await createProfile(profile)
    activeProfileId = profile.id
    localStorage.setItem(KEY_ACTIVE, activeProfileId)
  }

  profiles = await fetchProfiles()
  renderProfiles()
  closeProfileModal()
}

async function deleteProfile() {
  if (!activeProfileId) return
  const p = profiles.find((x) => x.id === activeProfileId)
  if (!p || !confirm(`Delete profile "${p.name}"?`)) return

  await deleteProfileApi(activeProfileId)
  profiles = await fetchProfiles()
  activeProfileId = profiles[0]?.id || null
  if (activeProfileId) localStorage.setItem(KEY_ACTIVE, activeProfileId)
  else localStorage.removeItem(KEY_ACTIVE)
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

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: apiHeaders(),
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
      if (data.transcript) showTranscript(data.transcript)
    } else {
      setStatus(`sent ✓  ${data.messageId || data.response || ''}`, 'ok')
      if (data.transcript) showTranscript(data.transcript)
    }
  } catch (err) {
    setStatus(`request failed: ${err.message}`, 'err')
  } finally {
    $('btn-send').disabled = false
  }
}

// ── Transcript panel ──
function showTranscript(lines) {
  let panel = document.getElementById('transcript-panel')
  if (panel) panel.remove()

  panel = document.createElement('div')
  panel.id = 'transcript-panel'
  panel.style.cssText = `
    position: fixed;
    bottom: 60px;
    right: 24px;
    width: 640px;
    max-height: 400px;
    background: var(--bg);
    border: 1px solid var(--border-active);
    border-radius: 6px;
    overflow-y: auto;
    z-index: 300;
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.6;
  `

  const header = document.createElement('div')
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg);
  `
  header.innerHTML = `
    <span style="color: var(--text-dim); letter-spacing: 1px; text-transform: uppercase; font-size: 10px;">SMTP Transcript</span>
    <div style="display:flex; gap:8px; align-items:center;">
      <button id="transcript-copy" style="background:none;border:1px solid var(--border);color:var(--text-dim);cursor:pointer;font-family:var(--mono);font-size:10px;padding:3px 8px;border-radius:3px;">Copy All</button>
      <button onclick="document.getElementById('transcript-panel').remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;">✕</button>
    </div>
  `

  const content = document.createElement('div')
  content.id = 'transcript-content'
  content.style.cssText = 'padding: 10px 12px;'
  content.innerHTML = lines.map(line => {
    let color = 'var(--text-dim)'
    if (line.startsWith('ERROR') || line.startsWith('FATAL')) color = 'var(--red)'
    else if (line.startsWith('WARN')) color = 'var(--yellow)'
    else if (line.includes('>>') || line.includes('Sending')) color = 'var(--accent)'
    else if (line.includes('<<') || line.includes('250')) color = 'var(--green)'
    return `<div style="color:${color}; white-space: pre-wrap; word-break: break-all;">${line}</div>`
  }).join('')

  panel.appendChild(header)
  panel.appendChild(content)
  document.body.appendChild(panel)

  document.getElementById('transcript-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      const btn = document.getElementById('transcript-copy')
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy All', 2000) }
    })
  })
}

// ── Log panel ──
async function openLogPanel() {
  let data
  try {
    const res = await fetch('/api/logs', { headers: apiHeaders() })
    data = await res.json()
  } catch (err) {
    alert('Failed to load logs: ' + err.message)
    return
  }

  let panel = document.getElementById('log-panel')
  if (panel) panel.remove()

  panel = document.createElement('div')
  panel.id = 'log-panel'
  panel.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(4px);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
  `

  const inner = document.createElement('div')
  inner.style.cssText = `
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 860px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `

  const header = document.createElement('div')
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  `
  header.innerHTML = `
    <span style="font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);letter-spacing:1px;text-transform:uppercase;">Transaction Log</span>
    <button onclick="document.getElementById('log-panel').remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:18px;">✕</button>
  `

  const body = document.createElement('div')
  body.style.cssText = 'overflow-y: auto; flex: 1;'

  const transactions = data.transactions || []

  if (transactions.length === 0) {
    body.innerHTML = `<div style="padding:40px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--text-dimmer);">No transactions yet.</div>`
  } else {
    transactions.forEach((t) => {
      const entry = document.createElement('div')
      entry.style.cssText = `padding: 14px 20px; border-bottom: 1px solid var(--border);`
      const resultColor = t.result === 'success' ? 'var(--green)' : 'var(--red)'
      const date = new Date(t.timestamp).toLocaleString()
      entry.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-family:var(--mono);font-size:11px;color:${resultColor};text-transform:uppercase;font-weight:600;">${t.result}</span>
          <span style="font-family:var(--mono);font-size:10px;color:var(--text-dimmer);">${date}</span>
        </div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text);margin-bottom:3px;">
          <span style="color:var(--text-dimmer);">from</span> ${t.from}
          <span style="color:var(--text-dimmer);margin-left:10px;">to</span> ${t.to}
        </div>
        <div style="font-family:var(--sans);font-size:12px;color:var(--text-dim);margin-top:4px;">${t.subject}</div>
        ${t.messageId ? `<div style="font-family:var(--mono);font-size:10px;color:var(--text-dimmer);margin-top:4px;">${t.messageId}</div>` : ''}
        ${t.transcript && t.transcript.length ? `<div style="margin-top:8px;"><button class="view-transcript-btn" style="font-family:var(--mono);font-size:10px;background:none;border:1px solid var(--border);color:var(--text-dim);padding:3px 8px;border-radius:3px;cursor:pointer;">View Transcript</button></div>` : ''}
      `

      const btn = entry.querySelector('.view-transcript-btn')
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          body.innerHTML = ''

          const backBar = document.createElement('div')
          backBar.style.cssText = `
            padding: 10px 20px;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
          `
          backBar.innerHTML = `
            <button id="back-to-log" style="font-family:var(--mono);font-size:11px;background:none;border:1px solid var(--border);color:var(--text-dim);padding:4px 10px;border-radius:3px;cursor:pointer;">← Back to Log</button>
            <button id="transcript-copy-log" style="font-family:var(--mono);font-size:11px;background:none;border:1px solid var(--border);color:var(--text-dim);padding:4px 10px;border-radius:3px;cursor:pointer;">Copy All</button>
          `
          body.appendChild(backBar)

          const transcriptContent = document.createElement('div')
          transcriptContent.style.cssText = 'padding:10px 20px;font-family:var(--mono);font-size:11px;line-height:1.6;'
          transcriptContent.innerHTML = t.transcript.map(line => {
            let color = 'var(--text-dim)'
            if (line.startsWith('ERROR') || line.startsWith('FATAL')) color = 'var(--red)'
            else if (line.startsWith('WARN')) color = 'var(--yellow)'
            else if (line.includes('>>') || line.includes('Sending')) color = 'var(--accent)'
            else if (line.includes('<<') || line.includes('250')) color = 'var(--green)'
            return `<div style="color:${color};white-space:pre-wrap;word-break:break-all;">${line}</div>`
          }).join('')
          body.appendChild(transcriptContent)

          backBar.querySelector('#back-to-log').addEventListener('click', () => openLogPanel())

          backBar.querySelector('#transcript-copy-log').addEventListener('click', () => {
            navigator.clipboard.writeText(t.transcript.join('\n')).then(() => {
              const copyBtn = document.getElementById('transcript-copy-log')
              if (copyBtn) { copyBtn.textContent = 'Copied!'; setTimeout(() => copyBtn.textContent = 'Copy All', 2000) }
            })
          })
        })
      }

      body.appendChild(entry)
    })
  }

  inner.appendChild(header)
  inner.appendChild(body)
  panel.appendChild(inner)
  document.body.appendChild(panel)

  panel.addEventListener('click', (e) => {
    if (e.target === panel) panel.remove()
  })
}

function resetApiKey() {
  sessionStorage.removeItem('port587_api_key')
  const key = prompt('Enter API key:') || ''
  if (key) sessionStorage.setItem('port587_api_key', key)
}

// ── Event wiring ──
elProfileSelect.addEventListener('change', () => {
  activeProfileId = elProfileSelect.value || null
  if (activeProfileId) localStorage.setItem(KEY_ACTIVE, activeProfileId)
  else localStorage.removeItem(KEY_ACTIVE)
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
$('btn-log').addEventListener('click', openLogPanel)
$('btn-apikey').addEventListener('click', resetApiKey)

elModalProfile.addEventListener('click', (e) => {
  if (e.target === elModalProfile) closeProfileModal()
})

// ── Init ──
async function init() {
  await loadProfiles()
  renderProfiles()
  renderTemplates()
}

init()