# Episode Builder Prompt

你将收到：

- 用户关注域。
- 注意力规则。
- 当前时间和场景。
- 候选资讯列表。

请生成一档 8 到 12 分钟的个人资讯电台节目。

## 节目结构

```json
{
  "episode_title": "string",
  "date": "YYYY-MM-DD",
  "duration_minutes": 10,
  "opening": "string",
  "chapters": [
    {
      "title": "string",
      "type": "mainline/brief/deep_dive/watchlist",
      "script": "string",
      "why_it_matters": "string",
      "sources": ["url"],
      "entities": ["string"],
      "follow_up": ["string"]
    }
  ],
  "closing": "string"
}
```

## 编排规则

1. 先给今日主线，不要先散播快讯。
2. 每个章节之间要有自然转场。
3. 快讯最多三条。
4. 深挖最多一条。
5. 结尾给出需要继续追踪的清单。
6. 保留来源链接。

## 评分规则

候选资讯按以下权重排序：

```text
score =
  novelty * 0.20 +
  impact * 0.25 +
  personal_relevance * 0.25 +
  source_quality * 0.15 +
  follow_up_value * 0.15 -
  noise_penalty * 0.25
```
