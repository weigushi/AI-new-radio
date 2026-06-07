import { readFile } from "node:fs/promises";
import { chapterText } from "../../../server/chapter-tts-text.mjs";
import { streamFishAudioToWritable } from "../../../server/tts/fish-audio-stream.mjs";

export const config = {
  maxDuration: 60
};

const episodePath = new URL("../../../sample/episode.today.json", import.meta.url);
const voicesPath = new URL("../../../config/voices.json", import.meta.url);

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(data, null, 2));
}

function selectedVoice(voices, voiceId) {
  return voices.voices.find((voice) => voice.id === voiceId)
    || voices.voices.find((voice) => voice.id === voices.default_voice_id)
    || voices.voices[0]
    || voices.fallback_voice;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const chapterId = String(req.query?.chapterId || "").trim();
  const [episode, voices] = await Promise.all([
    readFile(episodePath, "utf8").then(JSON.parse),
    readFile(voicesPath, "utf8").then(JSON.parse)
  ]);
  const chapter = episode.chapters.find((item) => item.id === chapterId);

  if (!chapter) {
    return sendJson(res, 404, { error: "Chapter not found" });
  }

  const voice = selectedVoice(voices, req.query?.voice_id);

  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    await streamFishAudioToWritable({
      text: chapterText(chapter),
      writable: res,
      referenceId: voice.reference_id
    });
  } catch (error) {
    if (!res.headersSent) {
      return sendJson(res, 500, { error: error.message });
    }
    console.warn(`Chapter audio stream failed: ${error.message}`);
  } finally {
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}
