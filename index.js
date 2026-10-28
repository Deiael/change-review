import { ChangeBoard, wrapFileSystem } from './lib/board.js'
import { registerTools } from './lib/tools.js'

export const name = 'change-review'
export const inject = ['fs', 'tools']

export const Config = {
  maxBytes: 524288,
  ignore: [],
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ maxBytes?: number, ignore?: string[] }} [config]
 */
export function apply(ctx, config = {}) {
  const board = new ChangeBoard({
    maxBytes: config.maxBytes ?? Config.maxBytes,
    ignore: config.ignore ?? Config.ignore,
  })

  ctx.effect(() => wrapFileSystem(ctx, board), 'change-review: wrap fs mutations')

  // fs/observed is synchronous and must not throw. Remember the actor so
  // later writeText/editText wrappers can bucket the file by session.
  ctx.on('fs/observed', (target, _observation, actor) => {
    try {
      board.rememberActor(target, actor)
    } catch {
      // ignore
    }
  })

  registerTools(ctx, board)
}
