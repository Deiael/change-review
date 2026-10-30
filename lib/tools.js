import { defineTool } from '@deepseek-ai/dsh-tools'
import { formatAction, formatComment, formatList, formatShow } from './format.js'
import { runSelftest } from './selftest.js'

function textResult(text) {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
  }
}

function sessionArg() {
  return {
    type: 'string',
    description: 'Session id. Omit to use "default" (also used when the filesystem actor has no session).',
  }
}

function pathArg(required = true) {
  return {
    type: 'string',
    required,
    description: 'File path as shown by change_review_list. Unique suffixes are allowed.',
  }
}

export function registerTools(ctx, board) {
  ctx.tools.register(
    defineTool({
      name: 'change_review_list',
      description:
        'List file changes made through the filesystem in this review board. Use after editing files so the human can see what is still pending.',
      parameters: {
        status: {
          type: 'string',
          description: 'Filter: pending (default), accepted, reverted, skipped, or all.',
        },
        sessionId: sessionArg(),
      },
      output: textResult(),
      async execute(args) {
        const sessionId = args.sessionId || 'default'
        const status = args.status || 'pending'
        const items = board.list(sessionId, status).map((item) => board.publicItem(item))
        const all = board.list(sessionId, 'all').map((item) => board.publicItem(item))
        return formatList({
          sessionId,
          status,
          items,
          pending: all.filter((i) => i.status === 'pending').length,
          accepted: all.filter((i) => i.status === 'accepted').length,
          reverted: all.filter((i) => i.status === 'reverted').length,
          skipped: all.filter((i) => i.status === 'skipped').length,
        })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'change_review_show',
      description: 'Show the unified diff and comments for one tracked file change.',
      parameters: {
        path: pathArg(),
        sessionId: sessionArg(),
        context: {
          type: 'number',
          description: 'Unchanged context lines around each hunk (default 3).',
        },
      },
      output: textResult(),
      async execute(args) {
        const sessionId = args.sessionId || 'default'
        const item = board.find(sessionId, args.path)
        if (!item) return formatShow({ ok: false, error: `no tracked change matching ${args.path}` })
        return formatShow({
          ok: true,
          item: board.publicItem(item),
          diff: board.diffFor(item, args.context),
        })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'change_review_accept',
      description:
        'Keep the current file contents. Drops the original snapshot so this file can no longer be reverted by the review board.',
      parameters: {
        path: pathArg(),
        sessionId: sessionArg(),
      },
      output: textResult(),
      async execute(args) {
        const result = await board.accept(args.sessionId || 'default', args.path)
        return formatAction(result, 'accept')
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'change_review_revert',
      description:
        'Restore a pending file to the snapshot taken before the first edit in this session. New files are deleted from disk.',
      parameters: {
        path: pathArg(),
        sessionId: sessionArg(),
      },
      output: textResult(),
      async execute(args) {
        const result = await board.revert(ctx.fs, args.sessionId || 'default', args.path)
        return formatAction(result, 'revert')
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'change_review_comment',
      description:
        'Record human review feedback on a tracked file. Call this when the user asks to change or complain about a specific edit.',
      parameters: {
        path: pathArg(),
        comment: {
          type: 'string',
          required: true,
          description: 'The human review note for this file.',
        },
        sessionId: sessionArg(),
      },
      output: textResult(),
      async execute(args) {
        const result = board.comment(args.sessionId || 'default', args.path, args.comment)
        return formatComment(result)
      },
    }),
  )
}

export function registerSelftestTools(ctx, { board, getConfig }) {
  ctx.tools.register(
    defineTool({
      name: 'change_review_scope',
      description:
        'Infer a development self-test scope from pending/accepted file diffs: files, symbols, and HTTP routes. Call this after editing, before writing tests.',
      parameters: {
        sessionId: sessionArg(),
      },
      output: textResult(),
      async execute(args) {
        const config = getConfig()
        if (!config.enableSelftest) return '开发自测已关闭。在设置里打开 enableSelftest。'
        return runSelftest(board, args.sessionId || 'default', 'scope', exploreFrom(config))
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'change_review_selftest',
      description:
        'Run a diff-scoped self-test plan. kind=unit (code self-test), edge (boundary cases), exploratory (hit exploreBaseUrl with the settings token), or all.',
      parameters: {
        kind: {
          type: 'string',
          description: 'unit | edge | exploratory | all. Default all.',
        },
        baseUrl: {
          type: 'string',
          description: 'Optional origin override for exploratory tests. Token still comes from settings.',
        },
        path: {
          type: 'string',
          description: 'Optional extra path for exploratory tests, e.g. /health.',
        },
        sessionId: sessionArg(),
      },
      output: textResult(),
      async execute(args) {
        const config = getConfig()
        if (!config.enableSelftest) return '开发自测已关闭。在设置里打开 enableSelftest。'
        const kind = String(args.kind || 'all').toLowerCase()
        return runSelftest(board, args.sessionId || 'default', kind, {
          ...exploreFrom(config),
          baseUrl: String(args.baseUrl || '').trim() || config.exploreBaseUrl,
          path: args.path,
        })
      },
    }),
  )
}

function exploreFrom(config) {
  return {
    baseUrl: config.exploreBaseUrl,
    token: config.exploreToken,
    timeoutMs: config.exploreTimeoutMs,
    hasToken: Boolean(config.exploreToken),
  }
}
