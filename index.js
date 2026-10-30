import { ChangeBoard, wrapFileSystem } from './lib/board.js'
import { readConfig } from './lib/config.js'
import { Config } from './lib/schema.js'
import { registerSelftestTools, registerTools } from './lib/tools.js'

export const name = 'change-review'
export const inject = ['fs', 'tools']
export { Config }

export function apply(ctx, config = {}) {
  const resolved = readConfig(config)
  const board = new ChangeBoard({
    maxBytes: resolved.maxBytes,
    ignore: resolved.ignore,
  })
  const getConfig = () => readConfig(config)

  ctx.effect(() => wrapFileSystem(ctx, board), 'change-review: wrap fs mutations')

  ctx.on('fs/observed', (target, _observation, actor) => {
    try {
      board.rememberActor(target, actor)
    } catch {
      // ignore
    }
  })

  registerTools(ctx, board)
  registerSelftestTools(ctx, { board, getConfig })
}
