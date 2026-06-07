import { readFile } from "node:fs/promises";
import { answerAsRadioHost } from "../../server/radio-host.mjs";

export const config = {
  maxDuration: 60
};

const episodePath = new URL("../../sample/episode.today.json", import.meta.url);
const voicesPath = new URL("../../config/voices.json", import.meta.url);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(data, null, 2));
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function publicErrorMessage(error) {
  const message = error?.message || String(error);
  if (message.includes("MOONSHOT_API_KEY")) {
    return "Vercel 还没有配置 MOONSHOT_API_KEY，主播暂时不能回答。";
  }
  return message;
}

function selectedVoice(voices, voiceId) {
  return voices.voices.find((voice) => voice.id === voiceId)
    || voices.voices.find((voice) => voice.id === voices.default_voice_id)
    || voices.voices[0]
    || voices.fallback_voice;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const message = String(body.message || "").trim();
  if (!message) {
    return sendJson(res, 400, { error: "message is required" });
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Connection", "keep-alive");

  try {
    sendEvent(res, "status", { message: "已收到问题，正在接通主播" });
    const [episode, voices] = await Promise.all([
      readFile(episodePath, "utf8").then(JSON.parse),
      readFile(voicesPath, "utf8").then(JSON.parse)
    ]);
    const voice = selectedVoice(voices, body.voice_id);
    const answer = await answerAsRadioHost({ message, episode });
    const generatedAudioAt = new Date().toISOString();

    sendEvent(res, "delta", { delta: answer });
    if (process.env.FISH_API_KEY) {
      const params = new URLSearchParams({
        text: answer,
        voice_id: voice.id,
        v: generatedAudioAt
      });
      sendEvent(res, "audio_stream", {
        text: answer,
        stream_url: `/api/replies/stream?${params}`,
        audio_url: null,
        generated_audio_at: generatedAudioAt,
        voice: {
          id: voice.id,
          label: voice.label,
          used_fallback: false
        }
      });
    } else {
      sendEvent(res, "status", { message: "缺少 FISH_API_KEY，已先显示文字回答。" });
    }
    sendEvent(res, "done", { ok: true });
  } catch (error) {
    sendEvent(res, "error", { error: publicErrorMessage(error) });
  } finally {
    res.end();
  }
}
