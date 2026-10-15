const fs = require('fs')
const file = process.argv[2]
const lines = fs.readFileSync(file, 'utf8').split('\n')

function block(name) {
  const out = []
  let cur = null
  let cols = null
  for (const line of lines) {
    if (line.startsWith('COPY ')) {
      const m = line.match(/^COPY (?:public\.)?([a-zA-Z0-9_]+) \(([^)]*)\) FROM stdin;/)
      if (m && m[1] === name) {
        cur = true
        cols = m[2].split(',').map((s) => s.trim())
      } else {
        cur = null
      }
      continue
    }
    if (cur) {
      if (line === '\\.') {
        cur = null
        continue
      }
      if (line.trim()) out.push(line)
    }
  }
  return { rows: out, cols }
}

const d = block('sys_dictionary')
const t = block('sys_dict_type')
console.log('dict cols:', d.cols.join(','))
const tIdx = {}
t.cols.forEach((c, i) => (tIdx[c] = i))
const enabledTypes = new Set()
for (const row of t.rows) {
  const f = row.split('\t')
  if (f[tIdx.status] === '1') enabledTypes.add(f[tIdx.id])
}
const dIdx = {}
d.cols.forEach((c, i) => (dIdx[c] = i))
let enabledRows = 0
const perType = new Map()
for (const row of d.rows) {
  const f = row.split('\t')
  if (f[dIdx.status] === '1' && enabledTypes.has(f[dIdx.type_id])) {
    enabledRows++
    perType.set(f[dIdx.type_id], (perType.get(f[dIdx.type_id]) || 0) + 1)
  }
}
console.log('sys_dictionary rows total:', d.rows.length)
console.log('enabled dict types:', enabledTypes.size, 'of', t.rows.length)
console.log('rows returned by fetchGetDictList:', enabledRows)
console.log('=> sequential 500-row pages:', Math.ceil(enabledRows / 500))
const top = [...perType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
console.log('largest dict types (typeId,rows):', top.map((x) => x[1]).join(', '))
