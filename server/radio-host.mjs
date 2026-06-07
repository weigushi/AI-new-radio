import { createKimiChatCompletion, createKimiChatCompletionStream } from "./kimi-client.mjs";

function compactEpisode(episode) {
  return {
    title: episode.title,
    date: episode.date,
    opening: episode.opening,
    chapters: episode.chapters.map((chapter) => ({
      title: chapter.title,
      type: chapter.type,
      summary: String(chapter.script || "").slice(0, 140),
      why_it_matters: chapter.why_it_matters,
      entities: chapter.entities?.slice(0, 8) || []
    }))
  };
}

function todayInShanghai() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai"
  }).format(new Date());
}

export function buildRadioHostMessages({ message, episode }) {
  const today = todayInShanghai();
  const system = [
    "你是 Guo News Radio 的中文 AI 电台主播。",
    "用户正在听一档资讯电台，他会像打电话一样向你追问。",
    "你的回答要短、自然、像主播即时回应，不要写成文章。",
    "优先基于给定节目内容回答，不要编造节目之外的事实。",
    `今天是${today}。`,
    "只要用户文本不为空，就不要说“没听清”“请再说一遍”。",
    "如果用户问“今天有什么新闻”，必须先问候，再说明今天日期，然后用三点概括当前节目里的新闻。",
    "每次回答控制在 120 到 220 个中文字符之间，适合直接 TTS 播放。",
    "不要输出 Markdown、复杂编号、括号说明或链接。",
    "把英文术语尽量转成适合中文口播的说法，例如 Agent 说成智能体，workflow 说成工作流。"
  ].join("\n");

  const user = [
    `当前日期：${today}`,
    "当前节目上下文：",
    JSON.stringify(compactEpisode(episode)),
    "用户问题：",
    message
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

export async function answerAsRadioHost({ message, episode }) {
  const text = await createKimiChatCompletion({
    messages: buildRadioHostMessages({ message, episode })
  });

  return text || "嗨，我在。当前节目主要围绕 AI 产品进入工作流这条主线。你可以问我今天有什么新闻，或者让我展开其中一条。";
}

export async function streamAnswerAsRadioHost({ message, episode, onDelta }) {
  const text = await createKimiChatCompletionStream({
    messages: buildRadioHostMessages({ message, episode }),
    onDelta
  });

  return text || "嗨，我在。当前节目主要围绕 AI 产品进入工作流这条主线。你可以继续追问。";
}
