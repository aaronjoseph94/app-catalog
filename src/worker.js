import { createFreebuffAuth, isSameOriginRequest } from '@freebuff/auth'

const STATUSES = ['idea', 'building', 'live', 'archived']
const SCHEMA = `CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('idea','building','live','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)`

let auth, app, schemaReady

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

function validate(body) {
  const name = String(body?.name ?? '').trim()
  const url = String(body?.url ?? '').trim()
  const description = String(body?.description ?? '').trim()
  const tags = String(body?.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).join(',')
  const status = String(body?.status ?? 'idea')
  if (!name || name.length > 120) return { error: 'name required (max 120 chars)' }
  if (url && !/^https?:\/\/\S+$/i.test(url)) return { error: 'url must start with http:// or https://' }
  if (description.length > 500) return { error: 'description max 500 chars' }
  if (!STATUSES.includes(status)) return { error: 'bad status' }
  return { row: { name, url, description, tags, status } }
}

async function handler(request, env) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

  schemaReady ??= env.DB.prepare(SCHEMA).run()
  await schemaReady

  if (url.pathname === '/api/me') {
    const user = await auth.getUser(request)
    const sub = user?.sub ?? null
    return json({ sub, name: user?.name ?? null, owner: !!sub && sub === env.OWNER_ID })
  }

  if (url.pathname === '/api/apps' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM apps ORDER BY created_at DESC').all()
    return Response.json(results, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Everything below mutates: same-origin + owner only.
  if (!isSameOriginRequest(request, env.APP_ORIGIN)) return json({ error: 'bad origin' }, 403)
  const user = await auth.getUser(request)
  if (!user) return json({ error: 'sign in required' }, 401)
  if (!env.OWNER_ID || user.sub !== env.OWNER_ID) return json({ error: 'owner only' }, 403)

  const match = url.pathname.match(/^\/api\/apps(?:\/([\w-]+))?$/)
  if (!match) return json({ error: 'not found' }, 404)
  const id = match[1]

  if (request.method === 'POST' && !id) {
    const v = validate(await request.json().catch(() => null))
    if (v.error) return json(v, 400)
    const r = v.row
    const newId = crypto.randomUUID()
    await env.DB.prepare('INSERT INTO apps (id,name,url,description,tags,status) VALUES (?,?,?,?,?,?)')
      .bind(newId, r.name, r.url, r.description, r.tags, r.status).run()
    return json(await env.DB.prepare('SELECT * FROM apps WHERE id=?').bind(newId).first(), 201)
  }
  if (request.method === 'PUT' && id) {
    const v = validate(await request.json().catch(() => null))
    if (v.error) return json(v, 400)
    const r = v.row
    const res = await env.DB.prepare('UPDATE apps SET name=?,url=?,description=?,tags=?,status=? WHERE id=?')
      .bind(r.name, r.url, r.description, r.tags, r.status, id).run()
    if (!res.meta.changes) return json({ error: 'not found' }, 404)
    return json(await env.DB.prepare('SELECT * FROM apps WHERE id=?').bind(id).first())
  }
  if (request.method === 'DELETE' && id) {
    await env.DB.prepare('DELETE FROM apps WHERE id=?').bind(id).run()
    return new Response(null, { status: 204 })
  }
  return json({ error: 'method not allowed' }, 405)
}

export default {
  fetch(request, env) {
    auth ??= createFreebuffAuth({ clientId: env.FREEBUFF_CLIENT_ID, issuer: env.FREEBUFF_ISSUER, baseUrl: env.APP_ORIGIN, allowInsecureLocalhost: env.APP_ORIGIN.startsWith('http://localhost') })
    app ??= auth.wrap(handler)
    return app(request, env)
  },
}
