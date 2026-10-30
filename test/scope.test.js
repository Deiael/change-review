import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildExploreCalls } from '../lib/explore.js'
import { classifyPath, extractFromText, inferScope } from '../lib/scope.js'
import { formatUnitPlan } from '../lib/selftest.js'

test('classifyPath tags tests vs code', () => {
  assert.equal(classifyPath('src/app.ts'), 'code')
  assert.equal(classifyPath('src/app.test.ts'), 'test')
  assert.equal(classifyPath('package.json'), 'config')
})

test('extracts symbols and routes from added lines', () => {
  const into = { symbols: [], routes: [] }
  extractFromText(
    `
export function greet(name) { return name }
app.get('/api/hello', greet)
fetch('/api/hello')
`,
    into,
  )
  assert.ok(into.symbols.includes('greet'))
  assert.ok(into.routes.some((row) => row.includes('/api/hello')))
})

test('inferScope skips reverted files', () => {
  const scope = inferScope([
    {
      path: 'src/a.ts',
      status: 'pending',
      original: 'function old() {}',
      current: 'export function nextId() { return 1 }\napp.post("/api/items", nextId)',
      added: 2,
      removed: 1,
    },
    { path: 'gone.ts', status: 'reverted', original: 'a', current: 'b' },
  ])
  assert.equal(scope.files.length, 1)
  assert.ok(scope.symbols.includes('nextId'))
  assert.ok(scope.routes.some((row) => /POST/.test(row)))
  assert.match(formatUnitPlan(scope), /src\/a\.ts/)
})

test('explore stays on the configured origin', () => {
  const plan = buildExploreCalls('http://127.0.0.1:3000', ['GET /health', 'GET https://evil.example/x'])
  assert.equal(plan.ok, true)
  assert.equal(plan.calls.every((call) => call.url.startsWith('http://127.0.0.1:3000')), true)
})

test('explore rejects non-http', () => {
  assert.equal(buildExploreCalls('ftp://x', []).ok, false)
})
