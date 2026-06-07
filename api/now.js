export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    episode_id: "2026-06-06-evening",
    chapter_id: "mainline",
    position_seconds: 0,
    playing: false
  });
}
