// Shared by index.html and settings.html.
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const host = (url) => {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return url }
}

// Stable hue per app name; drives icon tile and card glow.
export function hue(name) {
  let h = 0
  for (const ch of name || '?') h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

// Uploaded icon, else a glassy letter tile.
export function iconHtml(app) {
  if (app.icon) return `<img class="app-icon" src="${esc(app.icon)}" alt="">`
  const h = hue(app.name)
  const letter = esc((app.name || '+').trim().charAt(0).toUpperCase() || '+')
  return `<span class="app-icon" style="background:radial-gradient(120% 120% at 25% 15%,hsl(${h} 85% 66%),hsl(${(h + 35) % 360} 70% 36%))" aria-hidden="true">${letter}</span>`
}

// Ultra-light line icons (1.25 stroke).
export const ICON = {
  arrow: '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8.5 7H17v8.5"/></svg>',
  plus: '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>',
  chevron: '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  image: '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="9" cy="9" r="1.6"/><path d="m20.5 15-4.5-4.5L5 20.5"/></svg>',
}
