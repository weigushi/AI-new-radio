import { readFile } from "node:fs/promises";
import path from "node:path";

export default async function handler(req, res) {
  try {
    const file = path.join(process.cwd(), "sample", "episode.today.json");
    const episode = JSON.parse(await readFile(file, "utf8"));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(episode);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
