import { inferScope, testableItems } from './scope.js'
import { runExplore } from './explore.js'

export function buildScope(board, sessionId) {
  const items = testableItems(board, sessionId)
  const scope = inferScope(items)
  return { items, scope }
}

export function formatScope(sessionId, scope) {
  const lines = [
    `开发自测范围 (${sessionId})`,
    `files ${scope.files.length} · code ${scope.kinds.code} · test ${scope.kinds.test} · config ${scope.kinds.config}`,
    `focus: ${scope.focus}`,
    '',
    'Changed files:',
  ]
  if (!scope.files.length) {
    lines.push('  (no pending/accepted file changes — edit files through ctx.fs first)')
    return lines.join('\n')
  }
  for (const file of scope.files) {
    lines.push(`  - ${file.kind} ${file.status} +${file.added}/-${file.removed} ${file.path}`)
  }
  if (scope.symbols.length) {
    lines.push('', 'Symbols to cover:')
    for (const name of scope.symbols) lines.push(`  - ${name}`)
  }
  if (scope.routes.length) {
    lines.push('', 'Routes / URLs inferred from the diff:')
    for (const route of scope.routes) lines.push(`  - ${route}`)
  }
  lines.push('')
  lines.push('Next: change_review_selftest kind=unit | edge | exploratory')
  return lines.join('\n')
}

export function formatUnitPlan(scope) {
  const lines = [
    '代码自测（根据本次 diff 推理）',
    '目标：用最小用例证明改动后的主路径仍然成立。',
    '',
    'Agent 应立刻做：',
  ]
  const codeFiles = scope.files.filter((file) => file.kind === 'code')
  if (!codeFiles.length) {
    lines.push('- 本次几乎没有代码文件。先确认审查台里的 pending/accepted 改动。')
    return lines.join('\n')
  }
  for (const file of codeFiles) {
    lines.push(`- 为 ${file.path} 补/跑测试，覆盖 +${file.added}/-${file.removed} 行`)
  }
  if (scope.symbols.length) {
    lines.push('- 优先断言这些符号的返回值/副作用：' + scope.symbols.slice(0, 12).join(', '))
  }
  lines.push('- 先跑与这些文件最接近的已有测试（同目录 test/ 或 *.test.*）')
  lines.push('- 不要扩大到无关模块')
  return lines.join('\n')
}

export function formatEdgePlan(scope) {
  const lines = [
    '边缘性测试（根据本次 diff 推理）',
    '目标：专门打空值、越界、非法输入、缺失文件、重复提交。',
    '',
  ]
  const names = scope.symbols.length ? scope.symbols.slice(0, 8) : scope.files.map((file) => file.path)
  for (const name of names) {
    lines.push(`${name}:`)
    lines.push('  - 空字符串 / null / undefined')
    lines.push('  - 超长输入、错误类型')
    lines.push('  - 重复调用与并发（若该符号会写状态）')
    lines.push('  - 失败路径要有明确错误，而不是抛未捕获异常')
  }
  if (scope.routes.length) {
    lines.push('', 'HTTP 边缘：')
    for (const route of scope.routes) {
      lines.push(`  - ${route} ：缺 token、坏 JSON、不存在的 id、方法不对`)
    }
  }
  lines.push('', 'Agent 应写出失败用例并执行，不要只描述。')
  return lines.join('\n')
}

export function formatExplorePlan(scope, { baseUrl, hasToken }) {
  const lines = [
    '探索性测试',
    `target: ${baseUrl || '(未配置 exploreBaseUrl)'}`,
    `token: ${hasToken ? 'set' : 'missing'}`,
    '',
  ]
  if (!baseUrl) {
    lines.push('在设置 → change-review 填写 exploreBaseUrl（和可选的 exploreToken），或在工具参数里传 baseUrl。')
    lines.push('Token 只放设置里，不要出现在对话或工具参数中。')
    return lines.join('\n')
  }
  lines.push('将只请求该 origin，根据 diff 里推断的路由做冒烟：')
  const routes = scope.routes.length ? scope.routes : ['GET /']
  for (const route of routes) lines.push(`  - ${route}`)
  return lines.join('\n')
}

export async function runSelftest(board, sessionId, kind, explore) {
  const { scope } = buildScope(board, sessionId)
  if (kind === 'scope') return formatScope(sessionId, scope)
  if (kind === 'unit') return formatUnitPlan(scope)
  if (kind === 'edge') return formatEdgePlan(scope)
  if (kind === 'exploratory') {
    const plan = formatExplorePlan(scope, explore)
    if (!explore.baseUrl) return plan
    const ran = await runExplore({
      baseUrl: explore.baseUrl,
      token: explore.token,
      routes: scope.routes,
      extraPath: explore.path,
      timeoutMs: explore.timeoutMs,
    })
    if (!ran.ok) return `${plan}\n\n探测失败：${ran.error}`
    const lines = [plan, '', '探测结果（不含 token）：']
    for (const row of ran.results) {
      lines.push(`  ${row.method} ${row.url} → ${row.status || row.error} (${row.ms}ms)`)
    }
    lines.push('', 'Agent 根据状态码继续修代码或补断言，不要把 token 写进文件或回复。')
    return lines.join('\n')
  }
  return [
    formatScope(sessionId, scope),
    '',
    formatUnitPlan(scope),
    '',
    formatEdgePlan(scope),
    '',
    formatExplorePlan(scope, explore),
  ].join('\n')
}
