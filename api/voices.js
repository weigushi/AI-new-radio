import { readFile } from "node:fs/promises";
import path from "node:path";

export default async function handler(req, res) {
  try {
    const file = path.join(process.cwd(), "config", "voices.json");
    const config = JSON.parse(await readFile(file, "utf8"));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      default_voice_id: config.default_voice_id,
      voices: config.voices
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
