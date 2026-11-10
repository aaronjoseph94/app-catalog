const MAX_ICON = 300_000 // data URL chars; client resizes to 256px so real icons are ~20-60 KB
// ponytail: 100k is the Workers PBKDF2 cap; it only runs at login and password change.
const PBKDF2_ITERATIONS = 100_000
const SESSION_DAYS = 30
const MIN_PASSWORD = 12
const MAX_PASSWORD = 256

const enc = new TextEncoder()
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0))
const sha256 = async (str) => b64(await crypto.subtle.digest('SHA-256', enc.encode(str)))

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

// Constant-time compare via SHA-256 digests (equal length).
async function sameSecret(a, b) {
  if (!a || !b) return false
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', enc.encode(v))))
  return crypto.subtle.timingSafeEqual(x, y)
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return ['pbkdf2-sha256', PBKDF2_ITERATIONS, b64(salt), b64(hash)].join(':')
}

// A stored hash wins. The ADMIN_PASSWORD secret is only the initial password.
async function checkPassword(env, password) {
  if (typeof password !== 'string' || !password || password.length > MAX_PASSWORD) return false
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'password'").first()
  if (!row) return sameSecret(password, env.ADMIN_PASSWORD)
  const [, iterations, salt, expected] = row.value.split(':')
  const actual = await pbkdf2(password, unb64(salt), Number(iterations))
  return crypto.subtle.timingSafeEqual(actual, unb64(expected).buffer)
}

async function createSession(env) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c])
  await env.DB.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)')
    .bind(await sha256(token), Date.now() + SESSION_DAYS * 86_400_000).run()
  return token
}

// Returns the stored hash of a live session token, or null.
async function sessionHash(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) return null
  const hash = await sha256(token)
  const row = await env.DB.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(hash, Date.now()).first()
  return row ? hash : null
}

function normalizeUrl(raw) {
  let u = String(raw ?? '').trim()
  if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

function validate(body) {
  const name = String(body?.name ?? '').trim()
  const url = normalizeUrl(body?.url)
  const description = String(body?.description ?? '').trim()
  const icon = String(body?.icon ?? '')
  if (!name || name.length > 80) return { error: 'Name is required (max 80 characters).' }
  if (!url) return { error: 'Enter a valid web address.' }
  if (description.length > 300) return { error: 'Description max 300 characters.' }
  if (icon && (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(icon) || icon.length > MAX_ICON))
    return { error: 'Icon must be a PNG, JPEG, WebP or GIF under 200 KB.' }
  return { row: { name, url, description, icon } }
}

async function handleApi(request, env, url) {
  if (url.pathname === '/api/apps' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, name, url, description, icon, position FROM apps ORDER BY position, created_at',
    ).all()
    return json(results)
  }

  if (url.pathname === '/api/login' && request.method === 'POST') {
    const body = await request.json().catch(() => null)
    if (!(await checkPassword(env, body?.password))) return json({ error: 'Wrong password.' }, 401)
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()).run()
    return json({ token: await createSession(env) })
  }

  // Everything else needs a live admin session.
  const session = await sessionHash(request, env)
  if (!session) return json({ error: 'Please unlock again.' }, 401)

  if (url.pathname === '/api/auth') return new Response(null, { status: 204 })

  if (url.pathname === '/api/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session).run()
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/api/password' && request.method === 'POST') {
    const body = await request.json().catch(() => null)
    if (!(await checkPassword(env, body?.current))) return json({ error: 'Current password is wrong.' }, 400)
    const next = typeof body?.next === 'string' ? body.next : ''
    if (next.length < MIN_PASSWORD || next.length > MAX_PASSWORD)
      return json({ error: `New password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.` }, 400)
    // Store the new hash and sign out every device in one batch, then sign this device back in.
    await env.DB.batch([
      env.DB.prepare("INSERT INTO settings (key, value) VALUES ('password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(await hashPassword(next)),
      env.DB.prepare('DELETE FROM sessions'),
    ])
    return json({ token: await createSession(env) })
  }

  const id = url.pathname.match(/^\/api\/apps(?:\/([\w-]+))?$/)?.[1]
  const isCollection = url.pathname === '/api/apps'

  if (isCollection && request.method === 'POST') {
    const v = validate(await request.json().catch(() => null))
    if (v.error) return json(v, 400)
    const { name, url: link, description, icon } = v.row
    const newId = crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO apps (id, name, url, description, icon, position) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM apps))',
    ).bind(newId, name, link, description, icon).run()
    return json({ id: newId }, 201)
  }
  if (id && request.method === 'PUT') {
    const v = validate(await request.json().catch(() => null))
    if (v.error) return json(v, 400)
    const { name, url: link, description, icon } = v.row
    const res = await env.DB.prepare('UPDATE apps SET name = ?, url = ?, description = ?, icon = ? WHERE id = ?')
      .bind(name, link, description, icon, id).run()
    return res.meta.changes ? json({ id }) : json({ error: 'Not found.' }, 404)
  }
  if (id && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM apps WHERE id = ?').bind(id).run()
    return new Response(null, { status: 204 })
  }
  return json({ error: 'Not found.' }, 404)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url)
    return env.ASSETS.fetch(request)
  },
}
