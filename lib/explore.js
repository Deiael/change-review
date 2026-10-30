const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

export function assertExploreTarget(baseUrl) {
  let url
  try {
    url = new URL(String(baseUrl || '').trim())
  } catch {
    return { ok: false, error: '探索性测试需要合法的 http(s) 网址。请在设置里填写 exploreBaseUrl。' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: '探索性测试只允许 http 或 https。' }
  }
  if (!url.hostname) return { ok: false, error: '网址缺少主机名。' }
  return { ok: true, origin: url.origin, base: url }
}

function splitRoute(entry) {
  const text = String(entry || '').trim()
  const match = text.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)$/i)
  if (match) return { method: match[1].toUpperCase(), path: match[2] }
  return { method: 'GET', path: text }
}

export function buildExploreCalls(baseUrl, routes, { extraPath } = {}) {
  const checked = assertExploreTarget(baseUrl)
  if (!checked.ok) return checked
  const origin = checked.origin
  const calls = []
  const seen = new Set()
  const list = [...(routes || [])]
  if (extraPath) list.unshift(`GET ${extraPath}`)
  if (!list.length) list.push('GET /')

  for (const entry of list) {
    const { method, path } = splitRoute(entry)
    if (!ALLOWED_METHODS.has(method)) continue
    let target
    try {
      target = path.startsWith('http') ? new URL(path) : new URL(path, origin + '/')
    } catch {
      continue
    }
    if (target.origin !== origin) continue
    const key = `${method} ${target.toString()}`
    if (seen.has(key)) continue
    seen.add(key)
    calls.push({ method, url: target.toString() })
    if (calls.length >= 12) break
  }
  return { ok: true, origin, calls }
}

function headersFor(token, method) {
  const headers = { accept: 'application/json, text/plain, */*' }
  if (token) headers.authorization = `Bearer ${token}`
  if (method !== 'GET' && method !== 'HEAD') headers['content-type'] = 'application/json'
  return headers
}

export async function runExplore({ baseUrl, token, routes, extraPath, timeoutMs = 8000 }) {
  const plan = buildExploreCalls(baseUrl, routes, { extraPath })
  if (!plan.ok) return plan
  const results = []
  for (const call of plan.calls) {
    const started = Date.now()
    try {
      const res = await fetch(call.url, {
        method: call.method,
        headers: headersFor(token, call.method),
        body: call.method === 'GET' || call.method === 'HEAD' ? undefined : '{}',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      })
      results.push({
        method: call.method,
        url: call.url,
        status: res.status,
        ok: res.ok,
        ms: Date.now() - started,
      })
    } catch (error) {
      results.push({
        method: call.method,
        url: call.url,
        status: 0,
        ok: false,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { ok: true, origin: plan.origin, results }
}
