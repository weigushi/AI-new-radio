# Fish Audio 接入说明

项目使用 Fish Audio REST TTS 为每个节目章节生成 mp3，并自动读取根目录 `.env`。

## 配置

```text
FISH_API_KEY=your_fish_audio_api_key
FISH_TTS_MODEL=s2-pro
FISH_REFERENCE_ID=59cb5986671546eaa6ca8ae6f29f6d22
FISH_TTS_TEMPERATURE=0.78
FISH_TTS_TOP_P=0.72
FISH_TTS_SPEED=0.94
FISH_TTS_VOLUME=0
PORT=3080
```

## 生成音频

```powershell
npm.cmd run tts
```

脚本读取：

```text
sample/episode.today.json
```

输出：

```text
public/audio/{episode_id}/{chapter_id}.mp3
```

并把每章的 `audio_url` 写回 `sample/episode.today.json`。

## 情绪控制

Fish Audio S2 模型通过方括号 cue 控制情绪。当前电台会在发送给 TTS 的文本中自动加入：

```text
[calm][confident]
[curious][calm]
[determined]
[break]
```

这些 cue 只用于生成声音，不写入前端字幕文本。

## 中文音色

当前使用 Fish Audio 公共中文旁白音色：

```text
reference_id=59cb5986671546eaa6ca8ae6f29f6d22
```

这个模型在 Fish Audio 模型列表中语言为 `zh`，标签包含 narration / educational，适合资讯电台。

## API

```text
POST https://api.fish.audio/v1/tts
Authorization: Bearer $FISH_API_KEY
Content-Type: application/json
model: s2-pro
```

请求体使用 `text`、`temperature`、`top_p`、`prosody`、`format: mp3`、`mp3_bitrate: 192` 等参数。
