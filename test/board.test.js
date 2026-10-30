import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ChangeBoard } from '../lib/board.js'
import { shouldIgnore } from '../lib/ignore.js'

function target(path, key = path) {
  return { displayPath: path, targetKey: key }
}

function memoryFs(files) {
  return {
    async readText(t) {
      if (!(t.targetKey in files)) throw new Error('missing')
      return files[t.targetKey]
    },
    async writeText(t, content) {
      files[t.targetKey] = content
      return { ok: true }
    },
    processPath(t) {
      return t.displayPath
    },
  }
}

test('shouldIgnore drops node_modules and git', () => {
  assert.equal(shouldIgnore('app/node_modules/pkg/index.js'), true)
  assert.equal(shouldIgnore('src/index.js'), false)
  assert.equal(shouldIgnore('foo.lock', ['*.lock']), true)
})

test('tracks first snapshot and later overwrite', async () => {
  const files = { '/w/a.ts': 'old\n' }
  const fs = memoryFs(files)
  const board = new ChangeBoard()
  const t = target('/w/a.ts')
  await board.captureBefore(fs, t)
  files['/w/a.ts'] = 'new\n'
  board.recordAfter(t, 'new\n', 'write')
  const [item] = board.list('default', 'pending')
  assert.equal(item.original, 'old\n')
  assert.equal(item.current, 'new\n')
  assert.equal(item.created, false)
  assert.match(board.diffFor(item), /^-old/m)
  assert.match(board.diffFor(item), /^\+new/m)
})

test('accept drops revert snapshot', async () => {
  const files = { '/w/a.ts': 'old\n' }
  const fs = memoryFs(files)
  const board = new ChangeBoard()
  const t = target('/w/a.ts')
  await board.captureBefore(fs, t)
  board.recordAfter(t, 'new\n', 'write')
  const accepted = await board.accept('default', '/w/a.ts')
  assert.equal(accepted.ok, true)
  assert.equal(accepted.item.status, 'accepted')
  const reverted = await board.revert(fs, 'default', '/w/a.ts')
  assert.equal(reverted.ok, false)
})

test('revert restores previous text', async () => {
  const files = { '/w/a.ts': 'old\n' }
  const fs = memoryFs(files)
  const board = new ChangeBoard()
  const t = target('/w/a.ts')
  await board.captureBefore(fs, t)
  files['/w/a.ts'] = 'new\n'
  board.recordAfter(t, 'new\n', 'write')
  const result = await board.revert(fs, 'default', '/w/a.ts')
  assert.equal(result.ok, true)
  assert.equal(files['/w/a.ts'], 'old\n')
  assert.equal(board.find('default', 'a.ts').status, 'reverted')
})

test('comment is stored', async () => {
  const files = { '/w/a.ts': 'old\n' }
  const fs = memoryFs(files)
  const board = new ChangeBoard()
  const t = target('/w/a.ts')
  await board.captureBefore(fs, t)
  board.recordAfter(t, 'new\n', 'write')
  const result = board.comment('default', 'a.ts', 'keep the old name')
  assert.equal(result.ok, true)
  assert.equal(result.item.comments[0].text, 'keep the old name')
})

test('revert deletes a created file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'change-review-'))
  const path = join(dir, 'created.txt')
  const files = {}
  const fs = {
    async readText() {
      throw new Error('missing')
    },
    async writeText(_t, content) {
      files[path] = content
      await writeFile(path, content)
    },
    processPath() {
      return path
    },
  }
  const board = new ChangeBoard()
  const t = target(path)
  await board.captureBefore(fs, t)
  await writeFile(path, 'hello')
  board.recordAfter(t, 'hello', 'write')
  const result = await board.revert(fs, 'default', path)
  assert.equal(result.ok, true)
  await assert.rejects(readFile(path))
})
