import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";
import { synthesizeWithFishAudio } from "./tts/fish-audio.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const episodePath = join(root, "sample", "episode.today.json");
const publicAudioRoot = join(root, "public", "audio");

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/([。！？；])/g, "$1\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function emotionForChapter(chapter) {
  if (chapter.type === "mainline") return "[calm][confident]";
  if (chapter.type === "brief") return "[confident]";
  if (chapter.type === "deep_dive") return "[curious][calm]";
  if (chapter.type === "watchlist") return "[determined]";
  return "[calm]";
}

function emotionalize(lines, chapter) {
  const firstCue = emotionForChapter(chapter);
  return lines.map((line, index) => {
    if (index === 0) return `${firstCue} ${line}`;
    if (index % 4 === 0) return `[break][calm] ${line}`;
    if (/关键|重要|底层|判断|意味着/.test(line)) return `[confident] ${line}`;
    if (/如果|可能|是否|值得/.test(line)) return `[curious] ${line}`;
    return line;
  }).join("\n");
}

function chapterText(chapter) {
  const lines = cleanText([
    chapter.title,
    chapter.script,
    chapter.why_it_matters ? `这件事重要在于：${chapter.why_it_matters}` : ""
  ].filter(Boolean).join("。"));

  return emotionalize(lines, chapter);
}

async function main() {
  await loadEnvFile(join(root, ".env"));

  const episode = JSON.parse(await readFile(episodePath, "utf8"));
  const audioDir = join(publicAudioRoot, episode.id);

  await mkdir(audioDir, { recursive: true });

  for (const chapter of episode.chapters) {
    const fileName = `${chapter.id}.mp3`;
    const outputPath = join(audioDir, fileName);

    console.log(`Synthesizing ${chapter.id}...`);
    const result = await synthesizeWithFishAudio({
      text: chapterText(chapter),
      outputPath,
      referenceId: process.env.FISH_REFERENCE_ID
    });

    chapter.audio_url = `/audio/${episode.id}/${fileName}`;
    console.log(`Wrote ${result.bytes} bytes -> ${chapter.audio_url}`);
  }

  episode.generated_audio_at = new Date().toISOString();
  await writeFile(episodePath, `${JSON.stringify(episode, null, 2)}\n`, "utf8");
  console.log(`Updated ${episodePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
