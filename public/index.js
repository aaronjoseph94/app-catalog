import { esc, iconHtml, reveal } from '/common.js'

const grid = document.getElementById('grid')
const q = document.getElementById('q')
let apps = []
document.getElementById('yr').textContent = new Date().getFullYear()

function render() {
  const term = q.value.trim().toLowerCase()
  const list = apps.filter((a) => !term || `${a.name} ${a.description} ${a.url}`.toLowerCase().includes(term))
  grid.innerHTML = list.length
    ? list.map((a, i) => `
      <a class="tile reveal" style="--i:${i % 8}" href="${esc(a.url)}" target="_blank" rel="noopener"${a.description ? ` title="${esc(a.description)}"` : ''}>
        ${iconHtml(a)}
        <span class="tile-name">${esc(a.name)}</span>
      </a>`).join('')
    : `<p class="empty">${apps.length ? 'No apps match that.' : 'No apps yet.'}</p>`
  reveal(grid)
}

q.addEventListener('input', render)
reveal()

try {
  apps = await (await fetch('/api/apps')).json()
  document.getElementById('count').textContent = `${apps.length} apps`
  render()
} catch {
  grid.innerHTML = '<p class="empty">Could not load apps. Try refreshing.</p>'
}
