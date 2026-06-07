const streamEndpoint = "https://api.fish.audio/v1/tts/stream/with-timestamp";

function streamBody({ text, referenceId }) {
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

async function writeChunk(writable, chunk) {
  if (writable.destroyed || writable.writableEnded) return;
  if (writable.write(chunk)) return;
  await new Promise((resolve) => writable.once("drain", resolve));
}

function takeSseEvents(buffer) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() || "";
  return { events: parts, rest };
}

async function handleEventText(eventText, onEvent) {
  const trimmed = eventText.trim();
  if (!trimmed) return;

  const data = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (data) await onEvent(JSON.parse(data));
}

export async function streamFishAudioToWritable({
  text,
  writable,
  referenceId,
  model = process.env.FISH_TTS_MODEL || "s2-pro"
}) {
  if (!process.env.FISH_API_KEY) {
    throw new Error("Missing FISH_API_KEY environment variable.");
  }

  if (!text || !text.trim()) {
    throw new Error("Cannot stream empty text.");
  }

  const response = await fetch(streamEndpoint, {
    method: "POST",
    signal: AbortSignal.timeout(90000),
    headers: {
      "Authorization": `Bearer ${process.env.FISH_API_KEY}`,
      "Content-Type": "application/json",
      "model": model
    },
    body: JSON.stringify(streamBody({ text, referenceId }))
  });

  if (!response.ok) {
    throw new Error(`Fish Audio stream failed: ${response.status} ${await response.text()}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const onEvent = async (event) => {
    if (!event.audio_base64) return;
    await writeChunk(writable, Buffer.from(event.audio_base64, "base64"));
  };

  for await (const chunk of response.body) {
    if (writable.destroyed || writable.writableEnded) break;
    buffer += decoder.decode(chunk, { stream: true });
    const parsed = takeSseEvents(buffer);
    buffer = parsed.rest;
    for (const eventText of parsed.events) {
      if (writable.destroyed || writable.writableEnded) break;
      await handleEventText(eventText, onEvent);
    }
  }

  buffer += decoder.decode();
  await handleEventText(buffer, onEvent);
}
