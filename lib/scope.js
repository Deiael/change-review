const SYMBOL_RE =
  /(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g
const ROUTE_RE =
  /(?:app|router|server)\.(get|post|put|patch|delete|head|options)\(\s*['"`]([^'"`]+)['"`]/gi
const FETCH_RE = /fetch\(\s*['"`]([^'"`]+)['"`]/gi
const PATH_RE = /['"`](\/(?:api|v\d+)\/[A-Za-z0-9._~?/[\]%-]*)['"`]/g
const ANNOTATION_RE = /@(Get|Post|Put|Patch|Delete|Head)\(\s*['"`]([^'"`]+)['"`]/gi

export function addedLines(original, current) {
  const before = new Set(String(original || '').split('\n'))
  const extra = []
  for (const line of String(current || '').split('\n')) {
    if (!before.has(line) && line.trim()) extra.push(line)
  }
  return extra
}

export function classifyPath(path) {
  const p = String(path || '').replaceAll('\\', '/').toLowerCase()
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p) || /\/tests?\//.test(p)) return 'test'
  if (/\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt)$/.test(p)) return 'code'
  if (/\.(json|ya?ml|toml|env|ini)$/.test(p) || p.endsWith('dockerfile')) return 'config'
  return 'other'
}

function pushUnique(list, value) {
  if (!value || list.includes(value)) return
  list.push(value)
}

export function extractFromText(text, into) {
  const src = String(text || '')
  SYMBOL_RE.lastIndex = 0
  let match
  while ((match = SYMBOL_RE.exec(src))) pushUnique(into.symbols, match[1])
  ROUTE_RE.lastIndex = 0
  while ((match = ROUTE_RE.exec(src))) {
    pushUnique(into.routes, `${match[1].toUpperCase()} ${match[2]}`)
  }
  ANNOTATION_RE.lastIndex = 0
  while ((match = ANNOTATION_RE.exec(src))) {
    pushUnique(into.routes, `${match[1].toUpperCase()} ${match[2]}`)
  }
  FETCH_RE.lastIndex = 0
  while ((match = FETCH_RE.exec(src))) {
    const url = match[1]
    if (url.startsWith('/') || url.startsWith('http')) pushUnique(into.routes, `GET ${url}`)
  }
  PATH_RE.lastIndex = 0
  while ((match = PATH_RE.exec(src))) pushUnique(into.routes, `GET ${match[1]}`)
}

export function inferScope(items) {
  const files = []
  const symbols = []
  const routes = []
  const kinds = { code: 0, test: 0, config: 0, other: 0 }
  const into = { symbols, routes }

  for (const item of items) {
    if (!item || item.status === 'skipped' || item.status === 'reverted') continue
    const kind = classifyPath(item.path)
    kinds[kind] += 1
    files.push({
      path: item.path,
      status: item.status,
      kind,
      created: Boolean(item.created),
      added: item.added ?? 0,
      removed: item.removed ?? 0,
    })
    extractFromText(addedLines(item.original, item.current).join('\n'), into)
    if (symbols.length < 8) extractFromText(item.current || '', into)
  }

  return {
    files,
    symbols: symbols.slice(0, 40),
    routes: routes.slice(0, 20),
    kinds,
    focus: kinds.code ? 'code' : kinds.config ? 'config' : 'mixed',
  }
}

export function testableItems(board, sessionId) {
  return board
    .list(sessionId, 'all')
    .filter((item) => item.status === 'pending' || item.status === 'accepted')
}
