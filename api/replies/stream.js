import { readFile } from "node:fs/promises";
import { streamFishAudioToWritable } from "../../server/tts/fish-audio-stream.mjs";

export const config = {
  maxDuration: 60
};

const voicesPath = new URL("../../config/voices.json", import.meta.url);

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

  const text = String(req.query?.text || "").trim();
  if (!text) {
    return sendJson(res, 400, { error: "text is required" });
  }

  const voices = JSON.parse(await readFile(voicesPath, "utf8"));
  const voice = selectedVoice(voices, req.query?.voice_id);

  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    await streamFishAudioToWritable({
      text: `[calm][confident] ${text}`,
      writable: res,
      referenceId: voice.reference_id
    });
  } catch (error) {
    if (!res.headersSent) {
      return sendJson(res, 500, { error: error.message });
    }
    console.warn(`Reply audio stream failed: ${error.message}`);
  } finally {
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}
