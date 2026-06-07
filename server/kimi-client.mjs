const baseUrl = "https://api.moonshot.cn/v1";

function assertKimiKey() {
  if (!process.env.MOONSHOT_API_KEY) {
    throw new Error("Missing MOONSHOT_API_KEY environment variable.");
  }
}

function kimiRequestBody({ messages, temperature, stream }) {
  const model = process.env.MOONSHOT_MODEL || "kimi-k2.6";
  const thinkingDisabled = model === "kimi-k2.6" && process.env.MOONSHOT_THINKING !== "enabled";
  const body = {
    model,
    messages,
    temperature: thinkingDisabled ? 0.6 : temperature,
    stream,
    max_tokens: Number(process.env.MOONSHOT_MAX_TOKENS || 512)
  };

  if (thinkingDisabled) {
    body.thinking = { type: "disabled" };
  }

  return body;
}

export async function createKimiChatCompletion({ messages, temperature = 1 }) {
  assertKimiKey();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: {
      "Authorization": `Bearer ${process.env.MOONSHOT_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(kimiRequestBody({ messages, temperature, stream: false }))
  });

  if (!response.ok) {
    throw new Error(`Kimi chat failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function createKimiChatCompletionStream({ messages, onDelta, temperature = 1 }) {
  assertKimiKey();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(90000),
    headers: {
      "Authorization": `Bearer ${process.env.MOONSHOT_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(kimiRequestBody({ messages, temperature, stream: true }))
  });

  if (!response.ok) {
    throw new Error(`Kimi stream failed: ${response.status} ${await response.text()}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content || "";
      if (!delta) continue;

      fullText += delta;
      await onDelta(delta, fullText);
    }
  }

  return fullText.trim();
}
