# change-review

DeepSeek Harness 插件：**改动审查台**。智能体通过 `ctx.fs` 写文件或做字面量编辑时，插件记下第一次改动前的快照，之后可以列出、看 diff、保留或还原。

## 它解决什么问题

长时间跑完一轮任务后，不必只听模型口头汇报。让模型（或你）调用审查工具，按文件确认每一处改动。

## 安装

包目录就是本仓库。装进当前 Web profile：

```bash
dsh plugin --profile web add "D:\2026View\change-review"
```

或在会话里用 `plugin_manager` 的 `install_bundle`，`target` 填上面的绝对路径。

装完后重启 `dsh web`。用下面命令确认挂上了 `id: change-review`：

```bash
dsh --profile web --dump-config
```

本机没有 `dsh` 命令时，先安装 DeepSeek Harness，再执行上述步骤。

## 工具

| 工具 | 作用 |
| --- | --- |
| `change_review_list` | 列出改动（默认只看 `pending`） |
| `change_review_show` | 某一文件的 unified diff 和审查意见 |
| `change_review_accept` | 保留当前内容，丢掉还原快照 |
| `change_review_revert` | 还原到首次改动前；新建文件则删除 |
| `change_review_comment` | 记下人对该文件的反馈，给模型继续改 |

对话里可以直接说：「列出这次改了哪些文件」「把 `src/app.ts` 还原」「这个 diff 里函数名不要改」。

## 工作原理

- 包装 `ctx.fs.writeText` / `ctx.fs.editText`，不占用 `fs/write-intent` 决策槽，因此不会和官方 observation policy 抢瀑布流。
- 第一次改某个文件前读取原文；之后只更新「当前内容」。
- 用 `fs/observed` 里的 actor 尽量按 session 分桶；拿不到 session 时记在 `default`。
- 默认忽略 `node_modules`、`.git`、`dist`、锁文件，以及超过 512 KiB 的文本。

## 配置

在更高一层 patch 里按 **整行替换** 覆盖 `change-review` 的 `config`（不是深合并）：

```yaml
- id: change-review
  name: change-review
  config:
    maxBytes: 524288
    ignore:
      - "*.lock"
      - coverage
```

## 开发

```bash
npm test
```

不把 `@deepseek-ai/*` 写进 `dependencies`，避免 Cordis 双副本。宿主 profile 会提供 peer。

## 范围（0.1）

- 审查面是工具输出里的 diff，不是独立 Web 侧栏（侧栏需要按你的 DSH 版本打 client bundle）。
- 只跟踪走 `ctx.fs` 的文本写/编辑。直接打 shell 改磁盘的操作不会进审查台。
- 接受之后不能再还原。
- 还原新建文件时走宿主 `processPath` + `unlink`，适合本地文件系统后端。

## License

MIT
