function normalizeToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").trim();
}

function itemTokens(item) {
  return new Set([
    item.domain,
    ...(item.entities || []),
    ...(item.signals || [])
  ].map(normalizeToken).filter(Boolean));
}

function overlap(a, b) {
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / Math.max(1, Math.min(a.size, b.size));
}

function clusterTitle(cluster) {
  const entityCounts = new Map();
  for (const item of cluster.items) {
    for (const entity of item.entities || []) {
      entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1);
    }
  }

  const [entity] = [...entityCounts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return entity ? `${entity} 相关进展` : cluster.items[0].title;
}

function clusterScore(cluster) {
  const total = cluster.items.reduce((sum, item) => sum + item.scores.total, 0);
  return total / cluster.items.length;
}

export function clusterItems(items) {
  const clusters = [];

  for (const item of items) {
    const tokens = itemTokens(item);
    const match = clusters.find((cluster) => {
      if (cluster.domain !== item.domain) return false;
      return overlap(cluster.tokens, tokens) >= 0.42;
    });

    if (match) {
      match.items.push(item);
      for (const token of tokens) match.tokens.add(token);
      continue;
    }

    clusters.push({
      id: `cluster_${clusters.length + 1}`,
      domain: item.domain,
      tokens,
      items: [item]
    });
  }

  return clusters
    .map((cluster) => ({
      id: cluster.id,
      domain: cluster.domain,
      title: clusterTitle(cluster),
      score: clusterScore(cluster),
      items: cluster.items,
      sources: [...new Set(cluster.items.map((item) => item.url))],
      entities: [...new Set(cluster.items.flatMap((item) => item.entities || []))]
    }))
    .sort((a, b) => b.score - a.score);
}
