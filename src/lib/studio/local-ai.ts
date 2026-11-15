/**
 * Free AI that runs on the user's own computer:
 * - scripts: Ollama (local LLM)
 * - narration: Kokoro TTS in the browser
 * - transcription: Whisper in the browser
 * - scene clips: free Pexels stock footage (free API key)
 * Same call shapes as the old server functions: fn({ data }).
 */
import { getFile, uploadFile } from "./media";
import { loadSettings } from "./settings";
import { VOICES } from "./types";

export interface ScriptResult {
  title: string;
  scenes: { text: string; visualPrompt: string; seconds: number }[];
}

export async function generateScript({ data: o }: { data: { mode: "create" | "improve"; prompt?: string; transcript?: string; seconds: number; style: string; language: string; sceneCount?: number } }): Promise<ScriptResult> {
  const { ollamaUrl, ollamaModel } = loadSettings();
  const sceneCount = o.sceneCount ?? Math.max(3, Math.min(10, Math.round(o.seconds / 6)));
  const words = Math.round(o.seconds * 2.3);
  const system =
    o.mode === "create"
      ? `You are a senior video scriptwriter. Turn the user's idea into a ${o.seconds}-second narrated video in ${o.language}. Write exactly ${sceneCount} scenes, about ${words} words total, with a strong hook and memorable ending. For each scene give "text" (narration in ${o.language}), "visualPrompt" (3-6 English keywords to search stock footage, e.g. "coffee farm sunrise") and "seconds" (3-10).`
      : `You are a senior video editor. Rewrite this transcript into an improved voiceover in ${o.language}: fix grammar, tighten the story, remove repetition, stronger intro and conclusion. Target ${o.seconds} seconds (~${words} words) in ${sceneCount} scenes. For each scene give "text", "visualPrompt" (3-6 English stock-footage search keywords) and "seconds" (3-10).`;
  const user = o.mode === "create" ? `Idea: ${o.prompt}` : `Transcript:\n${o.transcript}`;
  let res: Response;
  try {
    res = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        format: { type: "object", required: ["title", "scenes"], properties: { title: { type: "string" }, scenes: { type: "array", items: { type: "object", required: ["text", "visualPrompt", "seconds"], properties: { text: { type: "string" }, visualPrompt: { type: "string" }, seconds: { type: "number" } } } } } },
        messages: [{ role: "system", content: system }, { role: "user", content: `${user}\n\nReturn JSON only.` }],
      }),
    });
  } catch {
    throw new Error(`Can't reach Ollama at ${ollamaUrl}. Install Ollama, run "ollama pull ${ollamaModel}", keep it running, and open this app at http://localhost.`);
  }
  if (!res.ok) throw new Error(res.status === 404 ? `Ollama model "${ollamaModel}" isn't installed. Run: ollama pull ${ollamaModel}` : `Ollama error (${res.status}).`);
  const j = (await res.json()) as { message?: { content?: string } };
  let parsed: ScriptResult;
  try {
    parsed = JSON.parse(j.message?.content ?? "");
  } catch {
    throw new Error("The local AI returned an unreadable script. Try again.");
  }
  if (!parsed.scenes?.length) throw new Error("The local AI returned an empty script. Try rephrasing your prompt.");
  parsed.scenes = parsed.scenes.map((s) => ({ text: String(s.text ?? ""), visualPrompt: String(s.visualPrompt ?? ""), seconds: Math.max(3, Math.min(10, Math.round(Number(s.seconds) || 5))) }));
  return parsed;
}

// ---------- Voice (Kokoro, in browser) ----------
let ttsP: Promise<any> | null = null;
function tts() {
  if (!ttsP)
    ttsP = import("kokoro-js").then(({ KokoroTTS }) => KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "wasm" })).catch((e) => {
      ttsP = null;
      throw e;
    });
  return ttsP;
}
export async function generateVoice({ data }: { data: { text: string; voice: string; language: string; path: string } }) {
  if (data.language !== "English") throw new Error("The free offline voice only speaks English. Switch narration language to English.");
  const voice = VOICES.some((v) => v.id === data.voice) ? data.voice : VOICES[0].id;
  const model = await tts();
  const audio = await model.generate(data.text, { voice });
  const blob: Blob = audio.toBlob();
  await uploadFile(data.path, blob, "audio/wav");
  const duration = audio.audio.length / audio.sampling_rate;
  return { path: data.path, duration };
}

// ---------- Transcription (Whisper, in browser) ----------
const LANG: Record<string, string> = { English: "english", Hindi: "hindi", Kannada: "kannada", Tamil: "tamil", Telugu: "telugu", Spanish: "spanish", French: "french", German: "german", Portuguese: "portuguese", Japanese: "japanese", Arabic: "arabic" };
let asrP: Promise<any> | null = null;
function asr() {
  if (!asrP)
    asrP = import("@huggingface/transformers").then(({ pipeline }) => pipeline("automatic-speech-recognition", "onnx-community/whisper-base")).catch((e) => {
      asrP = null;
      throw e;
    });
  return asrP;
}
export async function transcribeChunk({ data }: { data: { wavBase64: string; language?: string } }) {
  const bin = atob(data.wavBase64);
  const pcm = new Int16Array(new Uint8Array(Array.from(bin, (c) => c.charCodeAt(0))).buffer.slice(44));
  const f = Float32Array.from(pcm, (x) => x / 0x8000);
  const model = await asr();
  const lang = data.language ? LANG[data.language] : undefined;
  const r = await model(f, { ...(lang ? { language: lang, task: "transcribe" } : {}) });
  return { text: String((r as { text?: string }).text ?? "").trim() };
}

// ---------- Scene clips (free Pexels stock footage) ----------
export async function startSceneClip({ data }: { data: { prompt: string; style: string; ratio: "16:9" | "9:16"; seconds: number } }) {
  const { pexelsKey } = loadSettings();
  if (!pexelsKey) throw new Error("Add your free Pexels key in Settings to get stock clips (pexels.com/api, no payment).");
  const q = new URLSearchParams({ query: data.prompt.slice(0, 100), orientation: data.ratio === "9:16" ? "portrait" : "landscape", seconds: String(data.seconds) });
  const res = await fetch(`/api/stock-clip?${q}`, { headers: { "x-pexels-key": pexelsKey } });
  if (!res.ok) throw new Error((await res.text()) || "Could not get a stock clip.");
  const jobId = `tmp/clip-${crypto.randomUUID()}`;
  await uploadFile(jobId, await res.blob(), "video/mp4");
  return { jobId };
}
export async function pollSceneClip({ data }: { data: { jobId: string; path: string } }) {
  const b = await getFile(data.jobId);
  if (!b) return { status: "failed" as const, error: "Clip download was lost. Try again." };
  await uploadFile(data.path, b, "video/mp4");
  return { status: "ready" as const, path: data.path };
}

export async function generateMusicTrack(_: { data: { prompt: string; path: string } }): Promise<{ path: string }> {
  throw new Error("AI music isn't part of the free version. Upload a music file instead (free tracks: pixabay.com/music).");
}

export async function importFromUrl({ data }: { data: { url: string; path: string } }) {
  const res = await fetch(`/api/fetch-video?url=${encodeURIComponent(data.url)}`);
  if (!res.ok) throw new Error((await res.text()) || "Could not import that link.");
  const blob = await res.blob();
  await uploadFile(data.path, blob, blob.type);
  return { path: data.path, contentType: blob.type };
}
