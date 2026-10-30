# change-review

[![dsh.pub registry status](https://dsh.pub/api/badges/Deiael/change-review.svg)](https://dsh.pub/en/plugins/?q=Deiael%2Fchange-review)

DeepSeek Harness **Host 组合包**：改动审查台 + 按 diff 推理的开发自测。

智能体通过 `ctx.fs` 写文件或做字面量编辑时，插件记下第一次改动前的快照。之后可以列出、看 unified diff、保留或还原。改完后不必把 diff 再贴一遍：`change_review_scope` 从 pending / accepted 的改动抽出文件、符号、路由，再分 **代码自测 / 边缘性测试 / 探索性测试** 让 agent 自己补测。探索性测试需要你在设置里填网址和 token。

This is a community plugin. Listing on dsh.pub only means the public bundle contract passed automated checks; it is not an official DeepSeek product, security audit, or quality score.

**English:** Host bundle for DeepSeek Harness. It snapshots `ctx.fs.writeText` / `editText` so you can list, diff, accept, or revert agent edits. After that, `change_review_scope` infers files, symbols, and routes from pending/accepted diffs. `change_review_selftest` then plans unit tests, edge tests, or same-origin exploratory HTTP probes. Put `exploreBaseUrl` and `exploreToken` in plugin settings; the token is never printed in tool output. Install with `npx dshpub add Deiael/change-review --profile web`. See the tables below for config, tools, disable, and uninstall.

## 能力

| 面 | 说明 |
| --- | --- |
| 交付形态 | Host 工具插件（无独立 Web 侧栏） |
| 跟踪范围 | `ctx.fs.writeText` / `ctx.fs.editText` 的文本写/编辑 |
| 审查 | list / show / accept / revert / comment |
| 开发自测 | 从 diff 推理范围；unit / edge 给 agent 计划；exploratory 对配置 origin 冒烟 |
| 数据 | 快照在进程内存里，按 session 分桶；不落盘 |
| Token | `exploreToken` 只放设置，不出现在工具返回 |

## 兼容性

- DeepSeek Harness 带 `fs` + `tools` 的 Web profile（开发时对照 `0.1.x` Host）
- Node.js `>= 22`
- peer：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`（由宿主提供，不要装进本包的 `dependencies`）

## 安装

公开仓库根目录就是可安装组合包。

**dsh.pub 推荐（钉死 commit）：**

```bash
npx dshpub add Deiael/change-review --profile web
```

**原生 DSH：**

```bash
dsh plugin --profile web add github:Deiael/change-review
```

**本地开发链接（目录必须一直存在）：**

```bash
dsh plugin --profile web add .
```

或在会话里用 `plugin_manager` 的 `install_bundle`，`target` 填仓库绝对路径或 Git 规格。

装完后重启 `dsh web`。

## 激活

```bash
dsh --profile web --dump-config
```

应出现组合包层，以及 `id: change-review`、`name: change-review`。设置页会出现 **改动审查台** 表单（`Config`）。

## 配置

设置 → change-review，或在更高一层 patch **整行替换** `config`（不是深合并）：

```yaml
- id: change-review
  name: change-review
  config:
    maxBytes: 524288
    ignore:
      - "*.lock"
      - coverage
    enableSelftest: true
    exploreBaseUrl: http://127.0.0.1:3000
    exploreToken: ""
    exploreTimeoutMs: 8000
```

| 字段 | 作用 |
| --- | --- |
| `maxBytes` | 超过则不跟踪（默认 512 KiB） |
| `ignore` | 额外忽略的路径片段或 `*.ext`（`node_modules`、`.git`、`dist`、锁文件已内置） |
| `enableSelftest` | 关闭后自测工具会提示未开启 |
| `exploreBaseUrl` | 探索性测试 origin，例如 `http://127.0.0.1:3000` |
| `exploreToken` | 可选 Bearer token，只保存在设置 |
| `exploreTimeoutMs` | 单次探测超时 |

Token 不要发给模型，也不要写进仓库。

## 工具

| 工具 | 作用 |
| --- | --- |
| `change_review_list` | 列出改动（默认 `pending`） |
| `change_review_show` | 某一文件的 unified diff 和审查意见 |
| `change_review_accept` | 保留当前内容，丢掉还原快照 |
| `change_review_revert` | 还原到首次改动前；新建文件则删除 |
| `change_review_comment` | 记下人对该文件的反馈 |
| `change_review_scope` | 从 pending/accepted diff 推理文件、符号、路由 |
| `change_review_selftest` | `kind=unit` / `edge` / `exploratory` / `all` |

对话示例：

```text
列出这次改了哪些文件
把 src/app.ts 还原
按这次改动做代码自测和边缘测试
对配置的网址做探索性测试
```

## 开发自测流程

1. 智能体改完文件后先调 `change_review_scope`。
2. `change_review_selftest` `kind=unit`：补/跑这些文件的主路径测试。
3. `kind=edge`：空值、越界、非法输入、缺 token。
4. `kind=exploratory`：用设置里的网址 + token，对 diff 推断出的路由做冒烟。只请求该 origin，最多 12 个请求，返回里只有状态码和耗时。

`kind=all` 会给出三类计划；只有 `exploratory` 会真正发 HTTP。

## 工作原理

- 包装 `ctx.fs.writeText` / `ctx.fs.editText`，不占用 `fs/write-intent` 决策槽。
- 第一次改某个文件前读取原文；之后只更新「当前内容」。
- 用 `fs/observed` 里的 actor 尽量按 session 分桶；拿不到 session 时记在 `default`。
- 卸载插件时 `ctx.effect` 会拆掉包装。

## 校验

```bash
npm test
```

当前用 `node --test`。本仓库 **没有** 在真实 `dsh web` 会话里做端到端安装冒烟；请在本机按上面「安装 / 激活」核对 `--dump-config` 和工具列表。

## 停用与卸载

1. 在 profile 里去掉 `change-review` 组合包层，或卸载该依赖。
2. 重启 Host。审查快照随进程消失，磁盘上已接受的文件不会被改回去。
3. 本地开发链接：删掉 profile 里对该目录的引用后再删仓库。

## 范围与限制

- 审查面是工具输出里的 diff，不是独立 Web 侧栏。
- 直接打 shell 改磁盘的操作不会进审查台。
- 接受之后不能再还原。
- 还原新建文件时走宿主 `processPath` + `unlink`，适合本地文件系统后端。
- 探索性测试不会跟到别的域名；失败时只报告状态或错误信息。

## License

MIT
