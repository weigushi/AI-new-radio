import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chapterText } from "./chapter-tts-text.mjs";
import { loadEnvFile } from "./env.mjs";
import { answerAsRadioHost, streamAnswerAsRadioHost } from "./radio-host.mjs";
import { createRealtimeTextQueue, streamRealtimeWithFishAudio, streamSegmentsWithFishAudio, streamWithFishAudio, synthesizeWithFishAudio } from "./tts/fish-audio.mjs";
import { streamFishAudioToWritable } from "./tts/fish-audio-stream.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
await loadEnvFile(join(root, ".env"));

const port = Number(process.env.PORT || 3080);
const pendingAudioStreams = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "expires": "0"
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function episodeToday() {
  return readJson(join(root, "sample", "episode.today.json"));
}

async function voiceConfig() {
  return readJson(join(root, "config", "voices.json"));
}

function selectedVoice(voices, voiceId) {
  return voices.voices.find((voice) => voice.id === voiceId)
    || voices.voices.find((voice) => voice.id === voices.default_voice_id)
    || voices.voices[0]
    || voices.fallback_voice;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function createSpeechChunker(queue) {
  let buffer = "";
  let first = true;

  function decorate(text) {
    const chunk = text.trim();
    if (!chunk) return "";
    if (!first) return chunk;
    first = false;
    return `[calm][confident] ${chunk}`;
  }

  function takeChunk(force = false) {
    if (!buffer.trim()) return "";
    const minLength = first ? 10 : 16;
    const sentenceMatch = buffer.match(/^([\s\S]{8,}?[。！？；.!?;\n])/u);
    const softMatch = buffer.match(/^([\s\S]{10,}?[，,、：:])/u);
    const maxLength = first ? 18 : 30;
    let end = 0;

    if (sentenceMatch && sentenceMatch[1].trim().length >= minLength) {
      end = sentenceMatch[1].length;
    } else if (softMatch && softMatch[1].trim().length >= minLength) {
      end = softMatch[1].length;
    } else if (buffer.trim().length >= maxLength || force) {
      end = Math.min(buffer.length, maxLength);
    }

    if (!end) return "";
    const chunk = buffer.slice(0, end);
    buffer = buffer.slice(end);
    return decorate(chunk);
  }

  return {
    push(delta) {
      buffer += delta;
      const chunks = [];
      let chunk = takeChunk(false);
      while (chunk) {
        chunks.push(chunk);
        chunk = takeChunk(false);
      }
      for (const item of chunks) queue.push(item);
      return chunks;
    },
    flush() {
      const chunks = [];
      let chunk = takeChunk(true);
      while (chunk) {
        chunks.push(chunk);
        chunk = takeChunk(true);
      }
      for (const item of chunks) queue.push(item);
      return chunks;
    }
  };
}

async function buildReplyAudio({ answer, selectedVoice, fallbackVoice }) {
  const replyId = `reply-${Date.now()}`;
  const replyPath = join(root, "public", "audio", "replies", `${replyId}.mp3`);
  let voiceUsed = selectedVoice;
  let usedFallback = false;

  await mkdir(dirname(replyPath), { recursive: true });

  try {
    await synthesizeWithFishAudio({
      text: `[calm][confident] ${answer}`,
      outputPath: replyPath,
      referenceId: selectedVoice.reference_id
    });
  } catch (error) {
    console.warn(`Voice ${selectedVoice.id} failed; falling back. ${error.message}`);
    voiceUsed = fallbackVoice;
    usedFallback = true;
    await synthesizeWithFishAudio({
      text: `[calm][confident] ${answer}`,
      outputPath: replyPath,
      referenceId: fallbackVoice.reference_id
    });
  }

  return {
    audio_url: `/audio/replies/${replyId}.mp3`,
    generated_audio_at: new Date().toISOString(),
    voice: {
      id: voiceUsed.id,
      label: voiceUsed.label,
      used_fallback: usedFallback
    }
  };
}

async function prepareReplyAudioStream({ answer = "", selectedVoice }) {
  const replyId = `reply-${Date.now()}`;
  const replyPath = join(root, "public", "audio", "replies", `${replyId}.mp3`);
  const textQueue = createRealtimeTextQueue();

  await mkdir(dirname(replyPath), { recursive: true });
  pendingAudioStreams.set(replyId, {
    text: answer ? `[calm][confident] ${answer}` : "",
    textQueue,
    outputPath: replyPath,
    voice: selectedVoice
  });

  return {
    stream_url: `/api/replies/${replyId}/stream`,
    audio_url: `/audio/replies/${replyId}.mp3`,
    generated_audio_at: new Date().toISOString(),
    textQueue,
    voice: {
      id: selectedVoice.id,
      label: selectedVoice.label,
      used_fallback: false
    }
  };
}

async function handleReplyAudioStream(req, res, replyId) {
  const pending = pendingAudioStreams.get(replyId);
  if (!pending) {
    return sendJson(res, 404, { error: "Audio stream not found or already consumed" });
  }

  res.writeHead(200, {
    "content-type": "audio/mpeg",
    "cache-control": "no-store, no-transform",
    "connection": "keep-alive",
    "x-accel-buffering": "no"
  });

  try {
    if (pending.textQueue) {
      const streamLive = process.env.FISH_LIVE_MODE === "websocket"
        ? streamRealtimeWithFishAudio
        : streamSegmentsWithFishAudio;
      await streamLive({
        textStream: pending.textQueue,
        outputPath: pending.outputPath,
        writable: res,
        referenceId: pending.voice.reference_id
      });
    } else {
      await streamWithFishAudio({
        text: pending.text,
        outputPath: pending.outputPath,
        writable: res,
        referenceId: pending.voice.reference_id
      });
    }
  } catch (error) {
    console.warn(`Fish Audio stream failed for ${replyId}: ${error.message}`);
  } finally {
    pendingAudioStreams.delete(replyId);
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}

async function handleChapterAudioStream(req, res, chapterId, url) {
  const [episode, voices] = await Promise.all([episodeToday(), voiceConfig()]);
  const chapter = episode.chapters.find((item) => item.id === chapterId);

  if (!chapter) {
    return sendJson(res, 404, { error: "Chapter not found" });
  }

  const voice = selectedVoice(voices, url.searchParams.get("voice_id"));
  res.writeHead(200, {
    "content-type": "audio/mpeg",
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no"
  });

  try {
    await streamFishAudioToWritable({
      text: chapterText(chapter),
      writable: res,
      referenceId: voice.reference_id
    });
  } catch (error) {
    console.warn(`Chapter audio stream failed for ${chapterId}: ${error.message}`);
  } finally {
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}

async function handleReplyTextAudioStream(req, res, url) {
  const text = String(url.searchParams.get("text") || "").trim();
  if (!text) {
    return sendJson(res, 400, { error: "text is required" });
  }

  const voices = await voiceConfig();
  const voice = selectedVoice(voices, url.searchParams.get("voice_id"));
  res.writeHead(200, {
    "content-type": "audio/mpeg",
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no"
  });

  try {
    await streamFishAudioToWritable({
      text: `[calm][confident] ${text}`,
      writable: res,
      referenceId: voice.reference_id
    });
  } catch (error) {
    console.warn(`Reply text audio stream failed: ${error.message}`);
  } finally {
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const replyStreamMatch = url.pathname.match(/^\/api\/replies\/([^/]+)\/stream$/);
  const chapterStreamMatch = url.pathname.match(/^\/api\/chapters\/([^/]+)\/stream$/);

  if (req.method === "GET" && chapterStreamMatch) {
    return handleChapterAudioStream(req, res, chapterStreamMatch[1], url);
  }

  if (req.method === "GET" && url.pathname === "/api/replies/stream") {
    return handleReplyTextAudioStream(req, res, url);
  }

  if (req.method === "GET" && replyStreamMatch) {
    return handleReplyAudioStream(req, res, replyStreamMatch[1]);
  }

  if (req.method === "GET" && url.pathname === "/api/episode/today") {
    return sendJson(res, 200, await episodeToday());
  }

  if (req.method === "GET" && url.pathname === "/api/voices") {
    const config = await voiceConfig();
    return sendJson(res, 200, {
      default_voice_id: config.default_voice_id,
      voices: config.voices
    });
  }

  if (req.method === "GET" && url.pathname === "/api/now") {
    return sendJson(res, 200, {
      episode_id: "2026-06-06-evening",
      chapter_id: "mainline",
      position_seconds: 0,
      playing: false
    });
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const body = await readBody(req);
    return sendJson(res, 200, {
      message: "收到。MVP 阶段先记录自然语言指令，后续接入 router。",
      received: body
    });
  }

  if (req.method === "POST" && url.pathname === "/api/ask") {
    const body = await readBody(req);
    const message = String(body.message || "").trim();
    if (!message) {
      return sendJson(res, 400, { error: "message is required" });
    }

    const [episode, voices] = await Promise.all([episodeToday(), voiceConfig()]);
    const selectedVoice = voices.voices.find((voice) => voice.id === body.voice_id) || voices.voices[0];
    const fallbackVoice = voices.fallback_voice;
    const answer = await answerAsRadioHost({ message, episode });
    const audio = await buildReplyAudio({ answer, selectedVoice, fallbackVoice });

    return sendJson(res, 200, {
      text: answer,
      ...audio
    });
  }

  if (req.method === "POST" && url.pathname === "/api/ask/stream") {
    const body = await readBody(req);
    const message = String(body.message || "").trim();
    if (!message) {
      return sendJson(res, 400, { error: "message is required" });
    }

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no"
    });
    res.flushHeaders?.();
    sendEvent(res, "status", { message: "已收到问题，正在接入实时电台" });

    let activeTextQueue = null;
    try {
      const [episode, voices] = await Promise.all([episodeToday(), voiceConfig()]);
      const selectedVoice = voices.voices.find((voice) => voice.id === body.voice_id) || voices.voices[0];
      const audio = await prepareReplyAudioStream({ selectedVoice });
      const { textQueue, ...audioPayload } = audio;
      activeTextQueue = textQueue;
      const chunker = createSpeechChunker(textQueue);

      sendEvent(res, "status", { message: "已收到问题，正在接通主播和实时语音" });
      sendEvent(res, "audio_stream", {
        text: "",
        ...audioPayload
      });
      const answer = await streamAnswerAsRadioHost({
        message,
        episode,
        onDelta: async (delta) => {
          sendEvent(res, "delta", { delta });
          chunker.push(delta);
        }
      });

      chunker.flush();
      textQueue.close();
      sendEvent(res, "done", { ok: true });
      res.end();
    } catch (error) {
      if (activeTextQueue) activeTextQueue.fail(error);
      sendEvent(res, "error", { error: error.message });
      res.end();
    }
    return;
  }

  return sendJson(res, 404, { error: "API not found" });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/prototype/index.html" : url.pathname;
  const publicPath = pathname.startsWith("/audio/")
    ? join(root, "public", pathname.slice(1))
    : join(root, pathname.slice(1));
  const requested = normalize(publicPath);

  if (!requested.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(requested);
    res.writeHead(200, {
      "content-type": contentTypes[extname(requested)] || "application/octet-stream",
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache",
      "expires": "0"
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Guo News Radio listening on http://localhost:${port}`);
});
