import { esc, host, hue, iconHtml, ICON, reveal } from '/common.js'

const grid = document.getElementById('grid')
const q = document.getElementById('q')
let apps = []
document.getElementById('yr').textContent = new Date().getFullYear()

// Tile the bento with no holes: alternate [7 tall, 5, 5] and [4, 4, 4], close out with 6s or a 12.
function sizes(n) {
  const out = []
  for (let row = 0; out.length < n; row++) {
    const left = n - out.length
    if (left === 1) out.push('s-12 wide')
    else if (left === 2) out.push('s-6', 's-6')
    else if (left === 4) out.push('s-6', 's-6', 's-6', 's-6')
    else out.push(...(row % 2 ? ['s-4', 's-4', 's-4'] : ['s-7 tall', 's-5', 's-5']))
  }
  return out.slice(0, n)
}

function render() {
  const term = q.value.trim().toLowerCase()
  const list = apps.filter((a) => !term || `${a.name} ${a.description} ${a.url}`.toLowerCase().includes(term))
  const size = sizes(list.length)
  document.getElementById('shown').textContent = `${String(list.length).padStart(2, '0')} / ${String(apps.length).padStart(2, '0')}`
  grid.innerHTML = list.length
    ? list.map((a, i) => `
      <div class="${size[i]} reveal" style="--i:${i % 6}">
        <a class="card" href="${esc(a.url)}" target="_blank" rel="noopener" style="--h:${hue(a.name)}">
          <div class="bezel"><div class="core">
            <div class="card-top">${iconHtml(a)}<span class="idx">${String(apps.indexOf(a) + 1).padStart(2, '0')}</span></div>
            <div class="card-body">
              <h2>${esc(a.name)}</h2>
              <div class="host">${esc(host(a.url))}</div>
              ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
            </div>
            <div class="card-foot"><span class="pill">Open <span class="pill-ic">${ICON.arrow}</span></span></div>
          </div></div>
        </a>
      </div>`).join('')
    : `<p class="empty">${apps.length ? 'Nothing in the index matches that.' : 'The index is empty.'}</p>`
  reveal(grid)
}

q.addEventListener('input', render)
reveal()

try {
  apps = await (await fetch('/api/apps')).json()
  document.getElementById('count').textContent = `Index · ${apps.length} apps`
  render()
} catch {
  grid.innerHTML = '<p class="empty">Could not load the index. Try refreshing.</p>'
}
