# bob-plugin-openrouter

[Bob](https://bobtranslate.com/) 的 [OpenRouter](https://openrouter.ai/) 翻译插件。

对比Bob 自带的 OpenRouter 该插件支持更多 OpenRouter 的配置选项：

- 思考模式：关闭 / 模型默认 / 指定强度 / Token 预算，可选择是否显示思考过程
- 供应商路由：按价格、吞吐或延迟排序，指定或排除供应商
- 数据策略：拒绝数据收集，或只用零数据保留（ZDR）的供应商
- 备用模型：主模型出错或限流时自动切换
- 响应缓存、预设（`@preset/名称`）、`:nitro` / `:floor` 变体
- 显示实际的供应商、模型和本次费用
- 同语言润色、自定义提示词、Markdown 译文
- 额外请求参数：任意 JSON 合并进请求体，覆盖未单独提供的参数

需要 Bob 1.21.0 及以上。

## 安装

从 [Releases](https://github.com/ChanningHe/bob-plugin-openrouter/releases) 下载 `.bobplugin` 文件，双击安装。之后的版本可以在 Bob 里直接检查更新。

## 使用

1. 在 [OpenRouter](https://openrouter.ai/settings/keys) 创建 API Key
2. 在 Bob 的插件设置里填写 API Key 和模型，例如 `google/gemini-2.5-flash`
3. 点「验证」：会检查 Key、模型是否存在，以及当前思考模式是否被模型支持

思考模式默认关闭。部分模型强制开启思考（如 `openai/gpt-5`），无法关闭，验证时会提示改为「模型默认」或某个强度。

开启响应缓存后，「重新翻译」会返回同一份缓存结果。

## 开发

```sh
npm test                 # 单元测试
just pack                # 打包到 dist/
OPENROUTER_API_KEY=sk-or-... node scripts/smoke.js [模型] [思考模式]   # 用真实接口跑一次
```

发布：

```sh
just release 0.2.0
```

会修改版本号、提交、打 tag 并推送。GitHub Actions 收到 tag 后跑测试、打包、创建 Release，并更新 `appcast.json`。

## License

MIT
