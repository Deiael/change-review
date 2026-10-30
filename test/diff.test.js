import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffLines, summarizeDiff, unifiedDiff } from '../lib/diff.js'

test('equal files produce an empty hunk list', () => {
  const diff = unifiedDiff('a.txt', 'one\ntwo\n', 'one\ntwo\n')
  assert.equal(diff, '--- a/a.txt\n+++ b/a.txt\n')
})

test('single line replacement', () => {
  const diff = unifiedDiff('n.txt', 'hello\n', 'world\n')
  assert.match(diff, /^-hello/m)
  assert.match(diff, /^\+world/m)
})

test('new file', () => {
  const diff = unifiedDiff('new.txt', null, 'abc\n')
  assert.match(diff, /\/dev\/null/)
  assert.match(diff, /^\+abc/m)
  assert.deepEqual(summarizeDiff(null, 'abc\n'), { added: 1, removed: 0 })
})

test('deleted file', () => {
  const diff = unifiedDiff('old.txt', 'abc\n', null)
  assert.match(diff, /--- a\/old.txt/)
  assert.match(diff, /^\-abc/m)
})

test('diffLines keeps shared lines', () => {
  const edits = diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])
  assert.deepEqual(
    edits.map((e) => e.type),
    ['equal', 'del', 'ins', 'equal'],
  )
})
