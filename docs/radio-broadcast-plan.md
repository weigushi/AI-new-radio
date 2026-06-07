# 电台播报任务规划

## 第一版目标

只完成电台播报链路：

```text
mock/items.today.json
-> ranker
-> clusterer
-> episode builder
-> sample/episode.today.json
-> Fish Audio
-> PWA 播放
```

不做：

- 资讯爬取。
- 用户反馈。
- 长期记忆。
- 个性化训练。
- 多端推送。

## 输入契约

队友未来只要把爬取结果转成同样结构即可。

```json
{
  "id": "item_001",
  "title": "string",
  "url": "string",
  "source": "string",
  "published_at": "2026-06-06T09:00:00+08:00",
  "summary": "string",
  "content": "string",
  "domain": "ai/product/business/research",
  "entities": ["string"],
  "source_quality": 0.9,
  "signals": ["product_release", "funding", "research"]
}
```

## 输出契约

```json
{
  "id": "2026-06-06-evening",
  "title": "今天值得听的三件事",
  "opening": "string",
  "chapters": [
    {
      "id": "mainline",
      "title": "string",
      "type": "mainline/brief/deep_dive/watchlist",
      "script": "string",
      "why_it_matters": "string",
      "sources": ["url"],
      "entities": ["string"],
      "watch_items": ["string"]
    }
  ]
}
```

## 播报原则

1. 不是念标题，而是组织成一档节目。
2. 每条信息必须有“为什么重要”。
3. 同一事件多来源合并，不重复播。
4. 主线优先，快讯其次，最后给观察清单。
5. 第一版使用规则生成，不依赖 LLM，保证稳定可跑。

## 模块任务

### mock/items.today.json

放 10 到 20 条模拟资讯，覆盖 AI、产品、商业、研究四类。

### server/ranker.mjs

给每条资讯计算：

```text
score =
  novelty * 0.2
  + impact * 0.25
  + personal_relevance * 0.25
  + source_quality * 0.15
  + follow_up_value * 0.15
  - noise_penalty * 0.25
```

### server/clusterer.mjs

按实体和领域把资讯合并成事件组。

### server/episode-builder.mjs

生成四章：

- 今日主线。
- 快讯组。
- 深挖。
- 观察清单。

### server/build-episode.mjs

命令行入口：

```powershell
npm run episode
```

生成：

```text
sample/episode.today.json
```

如果 PowerShell 拦截 `npm.ps1`，直接运行：

```powershell
node server/build-episode.mjs
```
