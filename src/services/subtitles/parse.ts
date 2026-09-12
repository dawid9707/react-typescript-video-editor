import type { SubtitleCue } from "@/types";
import { uid } from "@/utils/format";

function toSeconds(stamp: string): number {
  const m = stamp.trim().replace(",", ".").match(/(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)/);
  if (!m) return 0;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  return h * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

export function parseSubtitles(content: string): { cues: SubtitleCue[]; format: "srt" | "vtt" } {
  const isVtt = /^WEBVTT/m.test(content.slice(0, 200));
  const text = content.replace(/\r\n/g, "\n").replace(/^WEBVTT.*\n/, "");
  const blocks = text.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx < 0) continue;
    const [rawStart, rawEnd] = lines[timeIdx].split("-->");
    const start = toSeconds(rawStart);
    const end = toSeconds(rawEnd.split(" ")[0] ?? rawEnd);
    const body = lines
      .slice(timeIdx + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!body) continue;
    cues.push({ id: uid("cue"), start, end: Math.max(end, start + 0.2), text: body });
  }
  return { cues, format: isVtt ? "vtt" : "srt" };
}

const stamp = (sec: number, comma: boolean): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)}${comma ? "," : "."}${p(ms, 3)}`;
};

export function serializeSrt(cues: SubtitleCue[]): string {
  return cues
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.text}\n`)
    .join("\n");
}

export function serializeVtt(cues: SubtitleCue[]): string {
  return (
    "WEBVTT\n\n" +
    cues
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((c) => `${stamp(c.start, false)} --> ${stamp(c.end, false)}\n${c.text}\n`)
      .join("\n")
  );
}
