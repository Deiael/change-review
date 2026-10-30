import { unlink } from 'node:fs/promises'
import { summarizeDiff, unifiedDiff } from './diff.js'
import { shouldIgnore } from './ignore.js'

const DEFAULT_MAX_BYTES = 512 * 1024

function nowIso() {
  return new Date().toISOString()
}

function keyOf(target) {
  return String(target?.targetKey || target?.displayPath || '')
}

function pathOf(target) {
  return String(target?.displayPath || target?.targetKey || '')
}

function sessionOf(actor) {
  if (!actor || typeof actor !== 'object') return 'default'
  return (
    actor.sessionId ||
    actor.sessionID ||
    actor.session_id ||
    actor.session?.id ||
    actor.ownerSessionId ||
    'default'
  )
}

export class ChangeBoard {
  /**
   * @param {{ maxBytes?: number, ignore?: string[] }} [config]
   */
  constructor(config = {}) {
    this.maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES
    this.ignore = config.ignore ?? []
    /** @type {Map<string, Map<string, object>>} */
    this.sessions = new Map()
    /** @type {Map<string, { original: string | null, created: boolean }>} */
    this.snapshots = new Map()
    /** @type {Map<string, { sessionId: string, actor: object }>} */
    this.lastActorByTarget = new Map()
    this.internal = 0
  }

  snapshotKey(sessionId, fileKey) {
    return `${sessionId}::${fileKey}`
  }

  rememberActor(target, actor) {
    const key = keyOf(target)
    if (!key || !actor) return
    this.lastActorByTarget.set(key, { sessionId: sessionOf(actor), actor })
  }

  sessionIdFor(target) {
    return this.lastActorByTarget.get(keyOf(target))?.sessionId || 'default'
  }

  bucket(sessionId) {
    const id = sessionId || 'default'
    let map = this.sessions.get(id)
    if (!map) {
      map = new Map()
      this.sessions.set(id, map)
    }
    return map
  }

  get(sessionId, fileKey) {
    return this.bucket(sessionId).get(fileKey)
  }

  list(sessionId, status = 'pending') {
    const items = [...this.bucket(sessionId).values()]
    const filtered = status === 'all' ? items : items.filter((item) => item.status === status)
    return filtered.sort((a, b) => String(a.path).localeCompare(String(b.path)))
  }

  byteLength(text) {
    return Buffer.byteLength(text ?? '', 'utf8')
  }

  skipReason(path, text) {
    if (shouldIgnore(path, this.ignore)) return 'ignored'
    if (text != null && this.byteLength(text) > this.maxBytes) return 'too-large'
    return null
  }

  /**
   * @param {{ readText: Function }} fs
   * @param {object} target
   * @param {AbortSignal | undefined} signal
   */
  async captureBefore(fs, target, signal) {
    if (this.internal) return
    const fileKey = keyOf(target)
    const path = pathOf(target)
    if (!fileKey || shouldIgnore(path, this.ignore)) return
    const sessionId = this.sessionIdFor(target)
    const snapKey = this.snapshotKey(sessionId, fileKey)
    if (this.snapshots.has(snapKey) || this.get(sessionId, fileKey)) return

    let original = null
    let created = false
    try {
      original = await fs.readText(target, signal)
      const skip = this.skipReason(path, original)
      if (skip) {
        this.bucket(sessionId).set(fileKey, {
          key: fileKey,
          path,
          sessionId,
          status: 'skipped',
          reason: skip,
          original: null,
          current: null,
          created: false,
          comments: [],
          updatedAt: nowIso(),
        })
        return
      }
    } catch {
      created = true
      original = null
    }

    this.snapshots.set(snapKey, { original, created })
  }

  recordAfter(target, content, op) {
    if (this.internal) return
    const fileKey = keyOf(target)
    const path = pathOf(target)
    if (!fileKey) return
    const sessionId = this.sessionIdFor(target)
    const skip = this.skipReason(path, content)
    const snap = this.snapshots.get(this.snapshotKey(sessionId, fileKey))
    let item = this.get(sessionId, fileKey)
    if (!item) {
      if (skip) return
      item = {
        key: fileKey,
        path,
        sessionId,
        status: 'pending',
        reason: null,
        original: snap ? snap.original : null,
        current: null,
        created: snap ? snap.created : true,
        comments: [],
        updatedAt: nowIso(),
        added: 0,
        removed: 0,
      }
      this.bucket(sessionId).set(fileKey, item)
    }
    if (item.status === 'skipped') return
    if (skip) {
      item.status = 'skipped'
      item.reason = skip
      item.updatedAt = nowIso()
      return
    }
    item.current = content
    item.op = op
    item.status = 'pending'
    const stats = summarizeDiff(item.original, item.current)
    item.added = stats.added
    item.removed = stats.removed
    item.updatedAt = nowIso()
  }

  diffFor(item, context) {
    if (!item || item.status === 'skipped') return ''
    return unifiedDiff(item.path, item.original, item.current, { context })
  }

  async accept(sessionId, pathQuery) {
    const item = this.find(sessionId, pathQuery)
    if (!item) return { ok: false, error: `no tracked change matching ${pathQuery}` }
    if (item.status === 'skipped') return { ok: false, error: `change was skipped (${item.reason})` }
    item.status = 'accepted'
    item.original = item.current
    item.created = false
    item.added = 0
    item.removed = 0
    item.updatedAt = nowIso()
    return { ok: true, item: this.publicItem(item) }
  }

  /**
   * @param {object} fs
   * @param {string} sessionId
   * @param {string} pathQuery
   */
  async revert(fs, sessionId, pathQuery) {
    const item = this.find(sessionId, pathQuery)
    if (!item) return { ok: false, error: `no tracked change matching ${pathQuery}` }
    if (item.status === 'skipped') return { ok: false, error: `change was skipped (${item.reason})` }
    if (item.status === 'accepted') return { ok: false, error: 'already accepted; original snapshot was dropped' }

    const target = { targetKey: item.key, displayPath: item.path }
    this.internal += 1
    try {
      if (item.created) {
        const processPath = typeof fs.processPath === 'function' ? fs.processPath(target) : item.path
        await unlink(processPath)
        item.current = null
      } else {
        await fs.writeText(target, item.original ?? '')
        item.current = item.original
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      this.internal -= 1
    }

    item.status = 'reverted'
    item.added = 0
    item.removed = 0
    item.updatedAt = nowIso()
    return { ok: true, item: this.publicItem(item) }
  }

  comment(sessionId, pathQuery, message) {
    const item = this.find(sessionId, pathQuery)
    if (!item) return { ok: false, error: `no tracked change matching ${pathQuery}` }
    const text = String(message || '').trim()
    if (!text) return { ok: false, error: 'comment is empty' }
    item.comments.push({ at: nowIso(), text })
    item.updatedAt = nowIso()
    return { ok: true, item: this.publicItem(item) }
  }

  find(sessionId, pathQuery) {
    const q = String(pathQuery || '').replaceAll('\\', '/')
    const items = [...this.bucket(sessionId).values()]
    const exact = items.find((item) => item.path.replaceAll('\\', '/') === q || item.key === pathQuery)
    if (exact) return exact
    const matches = items.filter((item) => item.path.replaceAll('\\', '/').endsWith(q) || item.path.includes(pathQuery))
    if (matches.length === 1) return matches[0]
    return undefined
  }

  publicItem(item) {
    return {
      path: item.path,
      status: item.status,
      reason: item.reason,
      created: Boolean(item.created),
      added: item.added ?? 0,
      removed: item.removed ?? 0,
      comments: item.comments,
      updatedAt: item.updatedAt,
    }
  }
}

export function wrapFileSystem(ctx, board) {
  const origWrite = ctx.fs.writeText
  const origEdit = ctx.fs.editText
  ctx.fs.writeText = async function writeTextTracked(target, content, expected, signal, sandboxPolicy) {
    await board.captureBefore(this, target, signal)
    const result = await origWrite.call(this, target, content, expected, signal, sandboxPolicy)
    board.recordAfter(target, content, 'write')
    return result
  }
  ctx.fs.editText = async function editTextTracked(target, edit, expected, signal, sandboxPolicy) {
    await board.captureBefore(this, target, signal)
    const result = await origEdit.call(this, target, edit, expected, signal, sandboxPolicy)
    try {
      const current = await this.readText(target, signal)
      board.recordAfter(target, current, 'edit')
    } catch {
      // Keep the pre-edit snapshot if the post-read fails.
    }
    return result
  }
  return () => {
    ctx.fs.writeText = origWrite
    ctx.fs.editText = origEdit
  }
}
