import { esc, host, iconHtml, ICON, reveal } from '/common.js'

const KEY = 'catalog-admin-session'
localStorage.removeItem('catalog-admin-password') // older builds stored the raw password
let token = localStorage.getItem(KEY) || ''
const $ = (id) => document.getElementById(id)

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 && path !== '/api/login') { lock(); throw new Error('Please unlock again.') }
  if (res.status === 204) return null
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Something went wrong.')
  return body
}

// Resize to a 256px square (cover crop) so uploads stay small.
async function toIcon(file) {
  const img = await createImageBitmap(file)
  const size = 256
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
  const s = Math.min(img.width, img.height)
  canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
  return canvas.toDataURL('image/webp', 0.85)
}

function itemHtml(app, i) {
  const isNew = !app.id
  const uid = esc(app.id || 'new')
  const summary = isNew
    ? `<span class="app-icon" aria-hidden="true">${ICON.plus}</span><span class="meta"><div class="name">Add an app</div><div class="host">Name, link, icon</div></span>`
    : `<span class="sum-icon">${iconHtml(app)}</span><span class="meta"><div class="name">${esc(app.name)}</div><div class="host">${esc(host(app.url))}</div></span>`
  return `
  <div class="bezel app-item${isNew ? ' add' : ''} reveal" style="--i:${i % 6}"><details class="core">
    <summary>${summary}<span class="chev" aria-hidden="true">${ICON.plus}</span></summary>
    <div class="drawer">
      <form class="app-form" novalidate>
        <div class="icon-picker">
          <span class="preview">${iconHtml(app)}</span>
          <label class="pill" for="file-${uid}">${app.icon ? 'Change icon' : 'Upload icon'} <span class="pill-ic">${ICON.image}</span></label>
          <input id="file-${uid}" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          <button type="button" class="pill no-ic" data-act="remove-icon" ${app.icon ? '' : 'hidden'}>Remove</button>
        </div>
        <div class="fields">
          <label class="label">Name<span class="input-shell"><input type="text" name="name" value="${esc(app.name || '')}" maxlength="80" required></span></label>
          <label class="label">URL<span class="input-shell"><input type="url" name="url" value="${esc(app.url || '')}" placeholder="example.com" inputmode="url" autocapitalize="off" required></span></label>
          <label class="label full">Description<span class="input-shell"><textarea name="description" maxlength="300" rows="2">${esc(app.description || '')}</textarea></span></label>
        </div>
        <div class="actions">
          <button class="pill primary" type="submit">${isNew ? 'Add to catalog' : 'Save changes'} <span class="pill-ic">${isNew ? ICON.plus : ICON.arrow}</span></button>
          ${isNew ? '' : `<button class="pill danger" type="button" data-act="delete">Delete <span class="pill-ic">${ICON.trash}</span></button>`}
          <span class="status" role="status"></span>
        </div>
      </form>
    </div>
  </details></div>`
}

function wire(item, app) {
  const form = item.querySelector('form')
  const f = form.elements
  let icon = app.icon || ''
  const status = form.querySelector('.status')
  const say = (msg, isError) => { status.textContent = msg; status.classList.toggle('error', !!isError) }
  const showIcon = () => {
    form.querySelector('.preview').innerHTML = iconHtml({ name: f.name.value || app.name, icon })
    form.querySelector('[data-act="remove-icon"]').hidden = !icon
  }

  form.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try { icon = await toIcon(file); showIcon(); say('Icon ready. Save to keep it.') }
    catch { say('Could not read that image.', true) }
    e.target.value = ''
  })
  form.querySelector('[data-act="remove-icon"]').addEventListener('click', () => { icon = ''; showIcon(); say('Icon removed. Save to keep it.') })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!f.name.value.trim() || !f.url.value.trim()) return say('Name and URL are required.', true)
    const btn = form.querySelector('button[type="submit"]')
    btn.disabled = true
    say('Saving…')
    const data = { name: f.name.value, url: f.url.value, description: f.description.value, icon }
    try {
      if (!app.id) { await api('/api/apps', { method: 'POST', body: JSON.stringify(data) }); await load(); return }
      await api(`/api/apps/${app.id}`, { method: 'PUT', body: JSON.stringify(data) })
      Object.assign(app, data)
      const sum = item.querySelector('summary')
      sum.querySelector('.name').textContent = f.name.value.trim()
      sum.querySelector('.sum-icon').innerHTML = iconHtml(app)
      // Show the normalized URL the server stored.
      const fresh = (await (await fetch('/api/apps')).json()).find((a) => a.id === app.id)
      if (fresh) { f.url.value = fresh.url; sum.querySelector('.host').textContent = host(fresh.url) }
      say('Saved.')
    } catch (err) { say(err.message, true) }
    btn.disabled = false
  })

  form.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${app.name}" from the catalog?`)) return
    try {
      await api(`/api/apps/${app.id}`, { method: 'DELETE' })
      item.remove()
      $('n').textContent = String($('list').children.length).padStart(2, '0')
    } catch (err) { say(err.message, true) }
  })
}

async function load() {
  const apps = await (await fetch('/api/apps')).json()
  $('add').innerHTML = itemHtml({}, 0)
  wire($('add').firstElementChild, {})
  $('n').textContent = String(apps.length).padStart(2, '0')
  $('list').innerHTML = apps.length ? apps.map((a, i) => itemHtml(a, i + 1)).join('') : '<p class="empty">No apps yet.</p>'
  $('list').querySelectorAll('.app-item').forEach((el, i) => wire(el, apps[i]))
  reveal()
}

function setToken(t) { token = t; localStorage.setItem(KEY, t) }

function lock() {
  token = ''
  localStorage.removeItem(KEY)
  $('admin').hidden = true
  $('lock').hidden = true
  $('login').hidden = false
  $('pw').focus()
  reveal()
}

async function unlock() {
  await api('/api/auth')
  $('login').hidden = true
  $('admin').hidden = false
  $('lock').hidden = false
  await load()
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = e.target.querySelector('button[type="submit"]')
  btn.disabled = true
  try {
    const { token: t } = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('pw').value }) })
    setToken(t)
    $('pw').value = ''
    $('login-err').textContent = ''
    await unlock()
  } catch (err) { $('login-err').textContent = err.message }
  btn.disabled = false
})

$('lock').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }) }
  catch (err) { if (token && !confirm(`Could not sign out on the server (${err.message}). This device will forget the session, but it stays valid until it expires. Continue?`)) return }
  lock()
})

$('pw-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const say = (msg, isError) => { $('pw-status').textContent = msg; $('pw-status').classList.toggle('error', !!isError) }
  const current = $('pw-current').value
  const next = $('pw-next').value
  if (next.length < 12) return say('New password must be at least 12 characters.', true)
  if (next !== $('pw-confirm').value) return say('New passwords do not match.', true)
  const btn = e.target.querySelector('button[type="submit"]')
  btn.disabled = true
  say('Updating…')
  try {
    const { token: t } = await api('/api/password', { method: 'POST', body: JSON.stringify({ current, next }) })
    setToken(t)
    e.target.reset()
    say('Password updated. Other devices are signed out.')
  } catch (err) { say(err.message, true) }
  btn.disabled = false
})

reveal()
if (token) unlock().catch(lock)
else lock()
