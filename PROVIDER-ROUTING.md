# 适用于 dsh-go 的 ChatGPT 提示词注入跳过版

**默认跳过 ChatGPT（`openai-codex`）的插件提示词注入，保留 DeepSeek 等其他提供方的原有注入行为。** 在 dsh-go 连接的 DSH 引擎侧按 provider 分别处理，不修改手机原生界面；使用远程主机时，应安装在实际处理模型请求的主机上。

本仓库是 `dsh-purge-community` **1.6.84** 已安装发行包的源码快照，加上本地的 provider 级提示词注入过滤修改。它不是上游的完整开发仓库，不含上游全部测试、前端开发工程或 Git 历史，也不是上游官方发行。

上游：https://github.com/kingcharleslzy-ai/dsh-purge

原有 MIT 许可证及版权、贡献者说明均保留。

## 当前行为

- 默认 `excludeProviders: [openai-codex]`：跳过 ChatGPT / Codex 的 Purge 提示词注入。
- DeepSeek 及其他未排除的 provider 保留原注入行为。
- 这不是“仅允许 DeepSeek”的默认配置。
- 按当前请求/Agent 的 provider 判断，不使用全局“最后选中的模型”状态。
- provider 未知时，默认排除列表仍允许注入；配置非空 `injectProviders` 白名单时，未知 provider 不注入。

## 三处功能修改

1. `lib/preset-injection.js`：解析 provider，增加 `excludeProviders` / `injectProviders` 判断。
2. `lib/index.js`：装配时遇到排除或未列入白名单的 provider，跳过 Purge 改写并清理其注入段。
3. `cordis.patch.yml`：显式默认排除 `openai-codex`。

新增的本文件、`.gitignore` 和 `test/provider-routing.local.test.mjs` 仅用于说明、发布和局部回归测试，不改变插件运行功能。

## 配置示例

在对应 profile 的 `id: dsh-purge` 配置覆盖中合并所需字段，不要替换整个配置文件。

默认排除 ChatGPT：

```yaml
- id: dsh-purge
  config:
    excludeProviders: [openai-codex]
```

仅对 DeepSeek 官方 provider 注入（需自行确认实际 provider ID）：

```yaml
- id: dsh-purge
  config:
    injectProviders: [deepseek-official]
```

清空 provider 排除列表：

```yaml
- id: dsh-purge
  config:
    excludeProviders: []
```

`excludeProviders: false` 也关闭默认排除列表；若同时设置了白名单，白名单仍生效。原有 `excludePresets` 过滤规则继续生效。

## 测试与边界

```sh
node --check lib/preset-injection.js
node --check lib/index.js
node --test test/provider-routing.local.test.mjs
```

这些是语法和局部策略测试，不等于真实模型请求、完整宿主生命周期、前端构建或全平台验收。此快照缺少上游完整开发测试集，因此不要将 `npm test` 当作此仓库的可用验收入口。

- 本修改只处理提示词注入路由，不撤销全局宿主补丁或权限配置。
- 既有对话历史中的旧注入正文不会被删除。
- 外部 shim、其他插件的注入及服务端的判定不属于本修改的覆盖范围。
- 载入已修改模块通常需要手动重启引擎；这里的发布操作不应用宿主补丁、不重启用户引擎。
- 后续安装上游版本可能覆盖这些本地修改。原有上游安装和更新链接仍指向上游，不会自动取得本仓库的修改。
- 打包时保留原包版本号 `1.6.84`，请通过本说明、源码或发布资产的 SHA256 区分本修改版。

## 隐私与打包

发布内容取自插件包，不含本机 DSH 的凭据、会话、诊断、个人配置和个人 `prompt-inject.md`。插件原有内置资源保留。发布前的文件名及常见密钥格式检查不等于对所有潜在隐私信息的完整审计。
