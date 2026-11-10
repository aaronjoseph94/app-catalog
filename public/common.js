// Shared by index.html and settings.html.
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const host = (url) => {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return url }
}

// Uploaded icon, else a coloured letter tile (stable colour per name).
export function iconHtml(app) {
  if (app.icon) return `<img class="app-icon" src="${esc(app.icon)}" alt="">`
  let h = 0
  for (const ch of app.name || '?') h = (h * 31 + ch.charCodeAt(0)) % 360
  const letter = esc((app.name || '?').trim().charAt(0).toUpperCase())
  return `<span class="app-icon" style="background:linear-gradient(135deg,hsl(${h} 70% 58%),hsl(${(h + 40) % 360} 70% 48%))" aria-hidden="true">${letter}</span>`
}
