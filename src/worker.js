const MAX_ICON = 300_000 // data URL chars; client resizes to 256px so real icons are ~20-60 KB

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

// Constant-time compare via SHA-256 digests (equal length).
async function sameSecret(a, b) {
  if (!a || !b) return false
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))))
  return crypto.subtle.timingSafeEqual(x, y)
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

  // Everything else needs the admin password.
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!(await sameSecret(token, env.ADMIN_PASSWORD))) return json({ error: 'Wrong password.' }, 401)

  if (url.pathname === '/api/auth') return new Response(null, { status: 204 })

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
