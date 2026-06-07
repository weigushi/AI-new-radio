import { readFile } from "node:fs/promises";

const voicesPath = new URL("../config/voices.json", import.meta.url);

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const config = JSON.parse(await readFile(voicesPath, "utf8"));
    return sendJson(res, 200, {
      default_voice_id: config.default_voice_id,
      voices: config.voices
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}
