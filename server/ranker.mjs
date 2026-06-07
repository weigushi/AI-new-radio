const highValueSignals = new Set([
  "product_release",
  "workflow",
  "agent",
  "business_metric",
  "research",
  "cost_reduction",
  "model_capability",
  "policy",
  "open_source",
  "knowledge"
]);

const noiseSignals = new Set(["pr", "drama", "low_signal"]);

const domainRelevance = {
  ai: 0.95,
  product: 0.9,
  business: 0.86,
  research: 0.84,
  policy: 0.72
};

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function signalRatio(item, set) {
  if (!item.signals?.length) return 0;
  const count = item.signals.filter((signal) => set.has(signal)).length;
  return count / item.signals.length;
}

function recencyScore(item, now) {
  const published = new Date(item.published_at).getTime();
  if (Number.isNaN(published)) return 0.5;
  const ageHours = Math.max(0, (now.getTime() - published) / 36e5);
  return clamp(1 - ageHours / 24);
}

export function scoreItem(item, now = new Date()) {
  const novelty = recencyScore(item, now);
  const impact = clamp(0.35 + signalRatio(item, highValueSignals) * 0.45 + (item.entities?.length || 0) * 0.04);
  const personal_relevance = domainRelevance[item.domain] ?? 0.55;
  const source_quality = clamp(item.source_quality ?? 0.6);
  const follow_up_value = clamp(
    signalRatio(item, new Set(["workflow", "agent", "research", "policy", "cost_reduction", "business_metric"])) * 0.65
    + (item.entities?.length || 0) * 0.06
  );
  const noise_penalty = clamp(signalRatio(item, noiseSignals) * 0.8 + (item.source_quality < 0.55 ? 0.2 : 0));

  const score = clamp(
    novelty * 0.2
    + impact * 0.25
    + personal_relevance * 0.25
    + source_quality * 0.15
    + follow_up_value * 0.15
    - noise_penalty * 0.25
  );

  return {
    ...item,
    scores: {
      novelty,
      impact,
      personal_relevance,
      source_quality,
      follow_up_value,
      noise_penalty,
      total: score
    }
  };
}

export function rankItems(items, now = new Date()) {
  return items
    .map((item) => scoreItem(item, now))
    .sort((a, b) => b.scores.total - a.scores.total);
}
