function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/([。！？；])/g, "$1\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function emotionForChapter(chapter) {
  if (chapter.type === "mainline") return "[calm][confident]";
  if (chapter.type === "brief") return "[confident]";
  if (chapter.type === "deep_dive") return "[curious][calm]";
  if (chapter.type === "watchlist") return "[determined]";
  return "[calm]";
}

function emotionalize(lines, chapter) {
  const firstCue = emotionForChapter(chapter);
  return lines.map((line, index) => {
    if (index === 0) return `${firstCue} ${line}`;
    if (index % 4 === 0) return `[break][calm] ${line}`;
    if (/关键|重要|底层|判断|意味着/.test(line)) return `[confident] ${line}`;
    if (/如果|可能|是否|值得/.test(line)) return `[curious] ${line}`;
    return line;
  }).join("\n");
}

export function chapterText(chapter) {
  const lines = cleanText([
    chapter.title,
    chapter.script,
    chapter.why_it_matters ? `这件事重要在于：${chapter.why_it_matters}` : ""
  ].filter(Boolean).join("。"));

  return emotionalize(lines, chapter);
}
