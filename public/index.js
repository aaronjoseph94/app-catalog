import { esc, iconHtml } from '/common.js'

const grid = document.getElementById('grid')
const q = document.getElementById('q')
let apps = []
document.getElementById('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

function render() {
  const term = q.value.trim().toLowerCase()
  const list = apps.filter((a) => !term || `${a.name} ${a.description} ${a.url}`.toLowerCase().includes(term))
  grid.innerHTML = list.length
    ? list.map((a, i) => `
      <a class="tile reveal" style="--i:${i}" href="${esc(a.url)}" target="_blank" rel="noopener"${a.description ? ` title="${esc(a.description)}"` : ''}>
        ${iconHtml(a)}
        <span class="tile-name">${esc(a.name)}</span>
      </a>`).join('')
    : `<p class="empty">${apps.length ? 'No apps match that.' : 'No apps yet.'}</p>`
}

q.addEventListener('input', render)

try {
  apps = await (await fetch('/api/apps')).json()
  render()
} catch {
  grid.innerHTML = '<p class="empty">Could not load apps. Try refreshing.</p>'
}
