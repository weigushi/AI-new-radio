# Guo News Radio

个人 AI 资讯电台。它不是新闻聚合器，而是一台替你判断什么值得进入脑子的资讯编排机器。

## MVP 目标

每天自动生成一档可听的资讯节目：

1. 从可信来源抓取候选资讯。
2. 按用户关注域、长期判断规则、来源质量和事件后续价值过滤噪音。
3. 把零散资讯编排成一档节目，而不是逐条念新闻。
4. 输出可听脚本、章节、摘要、观察清单和音频播放队列。

## 第一阶段交付物

- `docs/roadmap.md`：具体工作规划和任务拆解。
- `docs/architecture.md`：资讯电台施工图文字版。
- `docs/task-board.md`：开发任务看板。
- `docs/fish-audio.md`：Fish Audio TTS 接入说明。
- `config/user/interests.md`：用户关注域模板。
- `config/user/attention-rules.md`：注意力与过滤规则。
- `config/sources.json`：资讯源配置。
- `prompts/news-persona.md`：电台人格与判断提示词。
- `prompts/episode-builder.md`：节目生成提示词。
- `contracts/http.md`：PWA 和服务端 API 合约。
- `prototype/index.html`：可打开的前端原型。

## 核心流水线

```text
sources -> ingest -> normalize -> dedupe -> rank -> cluster -> script -> tts -> playback
```

## 运行

```powershell
npm run episode
npm run tts
npm start
```

如果 PowerShell 拦截 `npm.ps1`，使用：

```powershell
node server/build-episode.mjs
npm.cmd run tts
npm.cmd start
```

打开：

```text
http://localhost:3080
```

项目会自动读取根目录 `.env` 中的 Fish Audio 配置。
