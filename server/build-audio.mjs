import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chapterText } from "./chapter-tts-text.mjs";
import { loadEnvFile } from "./env.mjs";
import { synthesizeWithFishAudio } from "./tts/fish-audio.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const episodePath = join(root, "sample", "episode.today.json");
const publicAudioRoot = join(root, "public", "audio");

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
