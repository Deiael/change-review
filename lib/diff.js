const DEFAULT_CONTEXT = 3

/**
 * @param {string} before
 * @param {string} after
 * @returns {string[][]}
 */
export function splitLines(text) {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * Myers-inspired LCS backtrace for line arrays. Fine for review-sized files.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<{type: 'equal' | 'del' | 'ins', line: string}>}
 */
export function diffLines(a, b) {
  const n = a.length
  const m = b.length
  const max = n + m
  const v = new Map([[1, 0]])
  const trace = []

  if (n === 0 && m === 0) return []

  let found = false
  let dFound = 0
  for (let d = 0; d <= max; d++) {
    const snapshot = new Map(v)
    trace.push(snapshot)
    for (let k = -d; k <= d; k += 2) {
      let x
      const left = v.get(k - 1)
      const right = v.get(k + 1)
      if (k === -d || (k !== d && (left ?? -1) < (right ?? 0))) {
        x = right ?? 0
      } else {
        x = (left ?? 0) + 1
      }
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x += 1
        y += 1
      }
      v.set(k, x)
      if (x >= n && y >= m) {
        found = true
        dFound = d
        break
      }
    }
    if (found) break
  }

  const edits = []
  let x = n
  let y = m
  for (let d = dFound; d > 0; d--) {
    const vPrev = trace[d]
    const k = x - y
    let prevK
    const left = vPrev.get(k - 1)
    const right = vPrev.get(k + 1)
    if (k === -d || (k !== d && (left ?? -1) < (right ?? 0))) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }
    const prevX = vPrev.get(prevK) ?? 0
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x -= 1
      y -= 1
      edits.push({ type: 'equal', line: a[x] })
    }
    if (x === prevX) {
      y -= 1
      edits.push({ type: 'ins', line: b[y] })
    } else {
      x -= 1
      edits.push({ type: 'del', line: a[x] })
    }
  }
  while (x > 0 && y > 0) {
    x -= 1
    y -= 1
    edits.push({ type: 'equal', line: a[x] })
  }
  while (x > 0) {
    x -= 1
    edits.push({ type: 'del', line: a[x] })
  }
  while (y > 0) {
    y -= 1
    edits.push({ type: 'ins', line: b[y] })
  }
  edits.reverse()
  return edits
}

/**
 * @param {string} path
 * @param {string | null} before
 * @param {string | null} after
 * @param {{ context?: number }} [opts]
 */
export function unifiedDiff(path, before, after, opts = {}) {
  const context = opts.context ?? DEFAULT_CONTEXT
  const label = path.replaceAll('\\', '/')
  if (before == null && after == null) return ''
  if (before == null) {
    const lines = splitLines(after ?? '')
    const body = lines.map((line) => `+${line}`).join('\n')
    return `--- /dev/null\n+++ b/${label}\n@@ -0,0 +1,${lines.length} @@\n${body}`
  }
  if (after == null) {
    const lines = splitLines(before)
    const body = lines.map((line) => `-${line}`).join('\n')
    return `--- a/${label}\n+++ /dev/null\n@@ -1,${lines.length} +0,0 @@\n${body}`
  }

  const a = splitLines(before)
  const b = splitLines(after)
  const edits = diffLines(a, b)
  if (edits.every((e) => e.type === 'equal')) {
    return `--- a/${label}\n+++ b/${label}\n`
  }

  const hunks = []
  let i = 0
  while (i < edits.length) {
    if (edits[i].type === 'equal') {
      i += 1
      continue
    }
    let start = i
    while (start > 0 && i - start < context && edits[start - 1].type === 'equal') {
      start -= 1
    }
    let end = i
    while (end < edits.length) {
      if (edits[end].type !== 'equal') {
        end += 1
        continue
      }
      let run = 0
      while (end + run < edits.length && edits[end + run].type === 'equal') run += 1
      const remainingChange = edits.slice(end + run).some((e) => e.type !== 'equal')
      if (!remainingChange || run > context * 2) {
        end += Math.min(run, context)
        break
      }
      end += run
    }

    let oldStart = 1
    let oldCount = 0
    let newStart = 1
    let newCount = 0
    for (let j = 0; j < start; j++) {
      if (edits[j].type !== 'ins') oldStart += 1
      if (edits[j].type !== 'del') newStart += 1
    }
    const lines = []
    for (let j = start; j < end; j++) {
      const e = edits[j]
      if (e.type === 'equal') {
        oldCount += 1
        newCount += 1
        lines.push(` ${e.line}`)
      } else if (e.type === 'del') {
        oldCount += 1
        lines.push(`-${e.line}`)
      } else {
        newCount += 1
        lines.push(`+${e.line}`)
      }
    }
    hunks.push(
      `@@ -${oldCount === 0 ? oldStart - 1 : oldStart},${oldCount} +${newCount === 0 ? newStart - 1 : newStart},${newCount} @@\n${lines.join('\n')}`,
    )
    i = end
  }

  return `--- a/${label}\n+++ b/${label}\n${hunks.join('\n')}`
}

export function summarizeDiff(before, after) {
  const a = splitLines(before ?? '')
  const b = splitLines(after ?? '')
  if (before == null) return { added: b.length, removed: 0 }
  if (after == null) return { added: 0, removed: a.length }
  const edits = diffLines(a, b)
  let added = 0
  let removed = 0
  for (const e of edits) {
    if (e.type === 'ins') added += 1
    if (e.type === 'del') removed += 1
  }
  return { added, removed }
}
