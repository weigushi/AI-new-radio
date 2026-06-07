# HTTP Contract

## GET /api/now

返回当前播放状态。

```json
{
  "episode_id": "2026-06-06-morning",
  "chapter_id": "mainline",
  "position_seconds": 183,
  "playing": true
}
```

## GET /api/episode/today

返回今日节目。

```json
{
  "id": "2026-06-06-morning",
  "title": "今天真正值得听的三件事",
  "duration_seconds": 642,
  "chapters": [
    {
      "id": "mainline",
      "title": "今日主线",
      "start_seconds": 0,
      "duration_seconds": 180,
      "script": "string",
      "sources": ["https://example.com"]
    }
  ]
}
```

## GET /api/next

返回下一章或下一条待播内容。

## POST /api/chat

自然语言控制电台。

```json
{
  "message": "今天只听 AI 和投资相关的"
}
```

## WS /stream

推送播放状态、生成进度、突发更新。

```json
{
  "type": "episode.generating",
  "progress": 0.6,
  "message": "正在合并重复来源"
}
```
