import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { setDefaultResultOrder } from "node:dns";
import { dirname } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { FishAudioClient, RealtimeEvents } from "fish-audio";

const endpoint = "https://api.fish.audio/v1/tts";
const streamEndpoint = "https://api.fish.audio/v1/tts/stream/with-timestamp";
setDefaultResultOrder("ipv4first");

export function createRealtimeTextQueue() {
  const values = [];
  const waiters = [];
  let closed = false;
  let failure = null;

  return {
    push(value) {
      if (closed || failure) return;
      const text = String(value || "");
      if (!text) return;
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve({ value: text, done: false });
        return;
      }
      values.push(text);
    },
    close() {
      if (closed) return;
      closed = true;
      while (waiters.length) waiters.shift().resolve({ value: undefined, done: true });
    },
    fail(error) {
      failure = error instanceof Error ? error : new Error(String(error));
      while (waiters.length) waiters.shift().reject(failure);
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (values.length) return Promise.resolve({ value: values.shift(), done: false });
          if (failure) return Promise.reject(failure);
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
        }
      };
    }
  };
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function synthesizeWithPowerShell({ body, outputPath, model }) {
  const requestPath = `${outputPath}.request.json`;
  await writeFile(requestPath, JSON.stringify(body), "utf8");

  const command = [
    `$headers = @{ Authorization = "Bearer $env:FISH_API_KEY"; model = "${model}" }`,
    `$body = [System.IO.File]::ReadAllText(${psQuote(requestPath)}, [System.Text.Encoding]::UTF8)`,
    `$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)`,
    `Invoke-WebRequest -Uri ${psQuote(endpoint)} -Method POST -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes -OutFile ${psQuote(outputPath)} -TimeoutSec 120`
  ].join("; ");

  await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command
    ], {
      env: process.env,
      windowsHide: true
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`PowerShell Fish Audio request failed: ${stderr || `exit ${code}`}`));
    });
  });

  const file = await stat(outputPath);
  return {
    outputPath,
    bytes: file.size
  };
}

export async function synthesizeWithFishAudio({
  text,
  outputPath,
  model = process.env.FISH_TTS_MODEL || "s2-pro",
  referenceId = process.env.FISH_REFERENCE_ID
}) {
  if (!process.env.FISH_API_KEY) {
    throw new Error("Missing FISH_API_KEY environment variable.");
  }

  if (!text || !text.trim()) {
    throw new Error("Cannot synthesize empty text.");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const body = {
    text,
    ...(referenceId ? { reference_id: referenceId } : {}),
    temperature: Number(process.env.FISH_TTS_TEMPERATURE || 0.78),
    top_p: Number(process.env.FISH_TTS_TOP_P || 0.72),
    prosody: {
      speed: Number(process.env.FISH_TTS_SPEED || 0.94),
      volume: Number(process.env.FISH_TTS_VOLUME || 0),
      normalize_loudness: true
    },
    chunk_length: 260,
    format: "mp3",
    sample_rate: 44100,
    mp3_bitrate: 192,
    normalize: true,
    latency: "normal",
    max_new_tokens: 1024,
    repetition_penalty: 1.18,
    min_chunk_length: 50,
    condition_on_previous_chunks: true,
    early_stop_threshold: 1
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: {
        "Authorization": `Bearer ${process.env.FISH_API_KEY}`,
        "Content-Type": "application/json",
        "model": model
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Fish Audio TTS failed: ${response.status} ${await response.text()}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, audio);

    return {
      outputPath,
      bytes: audio.byteLength
    };
  } catch (error) {
    if (process.platform !== "win32") throw error;
    console.warn(`Node fetch failed (${error.cause?.code || error.message}); retrying with PowerShell.`);
    return synthesizeWithPowerShell({ body, outputPath, model });
  }
}

function streamingBody({ text, referenceId }) {
  return {
    text,
    ...(referenceId ? { reference_id: referenceId } : {}),
    temperature: Number(process.env.FISH_TTS_TEMPERATURE || 0.78),
    top_p: Number(process.env.FISH_TTS_TOP_P || 0.72),
    prosody: {
      speed: Number(process.env.FISH_TTS_SPEED || 0.94),
      volume: Number(process.env.FISH_TTS_VOLUME || 0),
      normalize_loudness: true
    },
    chunk_length: 120,
    format: "mp3",
    sample_rate: 44100,
    mp3_bitrate: 128,
    normalize: true,
    latency: "balanced",
    max_new_tokens: 1024,
    repetition_penalty: 1.18,
    min_chunk_length: 40,
    condition_on_previous_chunks: true,
    early_stop_threshold: 1
  };
}

function parseFishSse(buffer, onEvent) {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";

  for (const part of parts) {
    const data = part
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    onEvent(JSON.parse(data));
  }

  return rest;
}

export async function streamWithFishAudio({
  text,
  outputPath,
  writable,
  model = process.env.FISH_TTS_MODEL || "s2-pro",
  referenceId = process.env.FISH_REFERENCE_ID
}) {
  if (!process.env.FISH_API_KEY) {
    throw new Error("Missing FISH_API_KEY environment variable.");
  }

  await mkdir(dirname(outputPath), { recursive: true });

  const body = streamingBody({ text, referenceId });
  await writeFile(`${outputPath}.stream.request.json`, JSON.stringify(body), "utf8");

  const child = spawn("curl.exe", [
    "--no-buffer",
    "--silent",
    "--show-error",
    "--request",
    "POST",
    "--url",
    streamEndpoint,
    "--header",
    `Authorization: Bearer ${process.env.FISH_API_KEY}`,
    "--header",
    "Content-Type: application/json",
    "--header",
    `model: ${model}`,
    "--data-binary",
    "@-"
  ], {
    windowsHide: true
  });

  child.stdin.write(JSON.stringify(body));
  child.stdin.end();

  let buffer = "";
  let stderr = "";
  const chunks = [];
  let bytes = 0;
  const decoder = new StringDecoder("utf8");

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.stdout.on("data", (chunk) => {
    buffer += decoder.write(chunk);
    try {
      buffer = parseFishSse(buffer, (event) => {
        if (!event.audio_base64) return;
        const audio = Buffer.from(event.audio_base64, "base64");
        chunks.push(audio);
        bytes += audio.byteLength;
        if (writable && !writable.destroyed && !writable.writableEnded) {
          if (!writable.write(audio)) {
            child.stdout.pause();
            writable.once("drain", () => child.stdout.resume());
          }
        }
      });
    } catch (error) {
      child.kill();
      if (writable && !writable.destroyed && !writable.writableEnded) {
        writable.destroy(error);
      }
    }
  });

  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Fish Audio streaming failed: ${stderr || `exit ${code}`}`));
    });
  });

  await writeFile(outputPath, Buffer.concat(chunks));

  return {
    outputPath,
    bytes
  };
}

export async function streamRealtimeWithFishAudio({
  textStream,
  outputPath,
  writable,
  model = process.env.FISH_REALTIME_MODEL || "s1",
  referenceId = process.env.FISH_REFERENCE_ID
}) {
  if (!process.env.FISH_API_KEY) {
    throw new Error("Missing FISH_API_KEY environment variable.");
  }

  await mkdir(dirname(outputPath), { recursive: true });

  const client = new FishAudioClient({
    apiKey: process.env.FISH_API_KEY,
    baseUrl: "https://api.fish.audio"
  });

  const request = {
    text: "",
    ...(referenceId ? { reference_id: referenceId } : {}),
    temperature: Number(process.env.FISH_TTS_TEMPERATURE || 0.78),
    top_p: Number(process.env.FISH_TTS_TOP_P || 0.72),
    prosody: {
      speed: Number(process.env.FISH_TTS_SPEED || 0.94),
      volume: Number(process.env.FISH_TTS_VOLUME || 0)
    },
    chunk_length: 120,
    format: "mp3",
    sample_rate: 44100,
    mp3_bitrate: 128,
    normalize: true,
    latency: "balanced"
  };

  await writeFile(`${outputPath}.live.request.json`, JSON.stringify({
    ...request,
    reference_id: request.reference_id ? "[set]" : undefined,
    backend: model
  }), "utf8");

  const chunks = [];
  let bytes = 0;
  const connection = await client.textToSpeech.convertRealtime(request, textStream, model);

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };
    const timeout = setTimeout(() => {
      connection.close();
      finish(reject, new Error("Fish Audio realtime stream timed out."));
    }, Number(process.env.FISH_REALTIME_TIMEOUT_MS || 120000));

    connection.on(RealtimeEvents.AUDIO_CHUNK, (chunk) => {
      const audio = Buffer.from(chunk);
      chunks.push(audio);
      bytes += audio.byteLength;
      if (writable && !writable.destroyed && !writable.writableEnded) writable.write(audio);
    });

    connection.on(RealtimeEvents.ERROR, (error) => {
      finish(reject, error instanceof Error ? error : new Error(String(error)));
    });

    connection.on(RealtimeEvents.CLOSE, () => {
      finish(resolve);
    });
  });

  await writeFile(outputPath, Buffer.concat(chunks));

  return {
    outputPath,
    bytes
  };
}

export async function streamSegmentsWithFishAudio({
  textStream,
  outputPath,
  writable,
  model = process.env.FISH_TTS_MODEL || "s2-pro",
  referenceId = process.env.FISH_REFERENCE_ID
}) {
  if (!process.env.FISH_API_KEY) {
    throw new Error("Missing FISH_API_KEY environment variable.");
  }

  await mkdir(dirname(outputPath), { recursive: true });

  const segmentBuffers = [];
  let bytes = 0;
  let index = 0;

  for await (const text of textStream) {
    const content = String(text || "").trim();
    if (!content) continue;

    const segmentPath = `${outputPath}.segment-${String(index).padStart(3, "0")}.mp3`;
    index += 1;

    await streamWithFishAudio({
      text: content,
      outputPath: segmentPath,
      writable,
      model,
      referenceId
    });

    const audio = await readFile(segmentPath);
    segmentBuffers.push(audio);
    bytes += audio.byteLength;
  }

  await writeFile(outputPath, Buffer.concat(segmentBuffers));

  return {
    outputPath,
    bytes
  };
}
