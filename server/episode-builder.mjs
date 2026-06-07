function cnDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(date).replaceAll("/", "-");
}

function sentenceList(items) {
  return items.map((item, index) => `第${index + 1}条，${item.summary}`).join(" ");
}

function topEntities(clusters) {
  return [...new Set(clusters.flatMap((cluster) => cluster.entities))]
    .filter(Boolean)
    .slice(0, 8);
}

function reasonForCluster(cluster) {
  const signals = new Set(cluster.items.flatMap((item) => item.signals || []));
  if (signals.has("workflow")) return "它指向 AI 产品从功能演示走向真实工作流。";
  if (signals.has("cost_reduction")) return "它会改变哪些 AI 任务在经济上可行。";
  if (signals.has("research")) return "它影响我们判断模型能力进展的方式。";
  if (signals.has("policy")) return "它可能改变平台、模型服务和创作工具的发布链路。";
  if (signals.has("business_metric")) return "它比融资和发布会更接近真实商业质量。";
  return "它提供了今天判断 AI 产品变化的一条新证据。";
}

function estimateDuration(script) {
  const charsPerSecond = 4.1;
  return Math.max(35, Math.round(script.length / charsPerSecond));
}

function chapter(id, title, type, script, why, clusterList) {
  return {
    id,
    title,
    type,
    start_seconds: 0,
    duration_seconds: estimateDuration(script),
    script,
    why_it_matters: why,
    sources: [...new Set(clusterList.flatMap((cluster) => cluster.sources))],
    entities: [...new Set(clusterList.flatMap((cluster) => cluster.entities))],
    watch_items: [...new Set(clusterList.flatMap((cluster) => cluster.entities))]
      .filter(Boolean)
      .slice(0, 5)
  };
}

function addTiming(chapters) {
  let cursor = 0;
  return chapters.map((item) => {
    const timed = { ...item, start_seconds: cursor };
    cursor += item.duration_seconds;
    return timed;
  });
}

export function buildEpisode(clusters, now = new Date()) {
  const selected = clusters.slice(0, 6);
  const main = selected[0];
  const briefs = selected.slice(1, 4);
  const deepDive = selected.find((cluster) => cluster.items.some((item) => item.signals?.includes("workflow")))
    || selected[1]
    || main;
  const watchClusters = selected.slice(0, 5);
  const date = cnDate(now);

  const opening = `今天这期电台只看一件事：AI 正在从聊天框，移动到具体工作流。今天的几条消息，不是孤立更新，而是在说明入口、成本和真实使用数据正在一起变化。`;

  const mainScript = [
    `今日主线是：${main.title}。`,
    sentenceList(main.items.slice(0, 3)),
    `把这些信息合在一起看，关键不是谁又发布了一个功能，而是谁更接近用户每天真实开始工作的地方。`
  ].join("");

  const briefScript = briefs.map((cluster, index) => {
    const lead = cluster.items[0];
    return `${index + 1}. ${cluster.title}。${lead.summary}${reasonForCluster(cluster)}`;
  }).join("");

  const deepScript = [
    `今天值得多停一分钟的是：${deepDive.title}。`,
    sentenceList(deepDive.items.slice(0, 4)),
    `这件事的底层含义是，AI 产品的价值不再只由模型能力决定，而由它嵌入任务的深度决定。聊天框解决的是表达入口，工作流解决的是行动入口。`
  ].join("");

  const watchItems = topEntities(watchClusters).slice(0, 5);
  const watchScript = [
    `最后给出观察清单。`,
    watchItems.map((item, index) => `第${index + 1}，继续看 ${item}。`).join(""),
    `这些对象会帮助我们判断，下一阶段 AI 产品竞争到底落在模型、入口，还是具体任务链上。`
  ].join("");

  const chapters = addTiming([
    chapter("mainline", "今日主线：AI 正在进入工作流", "mainline", mainScript, reasonForCluster(main), [main]),
    chapter("briefs", "快讯组：三条值得保留的信号", "brief", briefScript, "这些短消息共同说明，市场正在从能力崇拜转向使用证明。", briefs),
    chapter("deep-dive", "深挖：为什么工作流比聊天框更重要", "deep_dive", deepScript, reasonForCluster(deepDive), [deepDive]),
    chapter("watchlist", "观察清单", "watchlist", watchScript, "观察清单负责把一次性新闻变成后续判断线索。", watchClusters)
  ]);

  return {
    id: `${date}-evening`,
    title: "今天值得听的三件事",
    date,
    duration_seconds: chapters.reduce((sum, item) => sum + item.duration_seconds, 0),
    domains: [...new Set(selected.map((cluster) => cluster.domain))],
    opening,
    chapters,
    generated_from: {
      item_count: selected.reduce((sum, cluster) => sum + cluster.items.length, 0),
      cluster_count: selected.length,
      mode: "mock-radio-broadcast-v1"
    }
  };
}
