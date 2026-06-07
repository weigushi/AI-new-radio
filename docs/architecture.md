# Guo News Radio 施工图

```text
个人 AI 资讯电台
关注域 -> 模拟资讯 -> 判断价值 -> 编排节目 -> 播放
```

## 第一层：外部上下文

### USER

用户品味语料，让电台知道什么算重要。

```text
config/user/interests.md
config/user/attention-rules.md
config/user/source-notes.md
```

### BRAIN

LLM 编排器，负责判断、改写、排序、串联、追问。

```text
prompts/news-persona.md
prompts/episode-builder.md
```

### NEWS

资讯源。

```text
RSS
Newsletter
Web article
YouTube transcript
Podcast transcript
PDF / report
Company announcement
GitHub / arXiv
```

### VOICE / I/O

播报与交互。

```text
TTS
PWA
Mobile
Feishu / Telegram
Home speaker
```

## 第二层：本地大脑

### router

识别用户意图：

```text
早报
晚报
突发
深度
只听 AI
只听商业
深度解释
```

### ingest

抓取资讯：

```text
rss.fetch
newsletter.ingest
web.fetch
transcript.fetch
pdf.parse
```

### ranker

判断价值：

```text
novelty
impact
personal_relevance
source_quality
follow_up_value
noise_penalty
```

### context

组装提示词：

```text
user taste
current time
listen history
fresh items
source scores
environment
```

### writer

编排节目：

```text
headline
brief
context
why_it_matters
what_to_watch
transition
```

### state

状态与记忆：

```text
items
sources
episodes
listens
skips
entities
```

## 第三层：运行时聚合

每次生成节目时，把六片材料贴进 context window：

```text
1. 系统提示词
2. 用户语料
3. 环境注入
4. 候选资讯
5. 用户输入 / 工具结果
6. 生成过程与执行轨迹
```

模型前向过程：

```text
compute(fragments)
-> classify
-> dedupe
-> rank
-> cluster
-> script
-> tts_plan
-> watch_items
```

## 第四层：交互层

### PWA

```text
Today
Sources
Settings
```

关键控件：

```text
play / pause
next chapter
show sources
```

### HTTP contract

```text
POST /api/chat
GET  /api/now
GET  /api/episode/today
GET  /api/next
WS   /stream
```
