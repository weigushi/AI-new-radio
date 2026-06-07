import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clusterItems } from "./clusterer.mjs";
import { buildEpisode } from "./episode-builder.mjs";
import { rankItems } from "./ranker.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const inputPath = join(root, "mock", "items.today.json");
const outputPath = join(root, "sample", "episode.today.json");

async function main() {
  const items = JSON.parse(await readFile(inputPath, "utf8"));
  const ranked = rankItems(items);
  const clusters = clusterItems(ranked);
  const episode = buildEpisode(clusters);

  await writeFile(outputPath, `${JSON.stringify(episode, null, 2)}\n`, "utf8");

  console.log(`Read ${items.length} mock items.`);
  console.log(`Built ${clusters.length} clusters.`);
  console.log(`Wrote ${episode.chapters.length} chapters -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
