import { readFile } from "node:fs/promises";

const episodePath = new URL("../../sample/episode.today.json", import.meta.url);

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
    const episode = JSON.parse(await readFile(episodePath, "utf8"));
    return sendJson(res, 200, episode);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}
