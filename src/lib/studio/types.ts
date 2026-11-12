export type Aspect = "landscape" | "portrait" | "square";

export interface Scene {
  id: string;
  /** Narration / transcript text for this scene. */
  text: string;
  /** Prompt used for AI clip generation. */
  visualPrompt: string;
  /** Seconds this scene occupies in the final video. */
  duration: number;
  source: "ai" | "original";
  keep: boolean;
  /** Original-video scenes: timestamps into the source video. */
  start?: number;
  end?: number;
  clipPath?: string;
  clipJobId?: string;
  clipStatus?: "idle" | "generating" | "ready" | "failed";
  clipError?: string;
  narrationPath?: string;
  narrationDuration?: number;
  narrationText?: string;
}

export interface Overlay {
  id: string;
  text: string;
  start: number;
  end: number;
  position: "top" | "center" | "bottom";
}

export interface ProjectData {
  prompt?: string;
  durationTarget: number;
  aspect: Aspect;
  style: string;
  language: string;
  voice: string;
  speed: number;
  scenes: Scene[];
  sourceVideoPath?: string;
  sourceDuration?: number;
  musicPath?: string;
  musicPrompt?: string;
  originalVolume: number;
  voiceVolume: number;
  musicVolume: number;
  subtitles: boolean;
  overlays: Overlay[];
  /** Pending AI-improved script awaiting user approval. */
  improvedDraft?: { title: string; scenes: { text: string; visualPrompt: string }[] };
}

export const STYLES = [
  "Cinematic",
  "Documentary",
  "Anime",
  "3D animation",
  "Watercolor",
  "Corporate clean",
  "Retro film",
  "Neon cyberpunk",
] as const;

export const LANGUAGES = [
  "English",
  "Hindi",
  "Kannada",
  "Tamil",
  "Telugu",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Japanese",
  "Arabic",
] as const;

export const VOICES = [
  { id: "Kore", label: "Kore", gender: "Female", tone: "Firm, clear" },
  { id: "Aoede", label: "Aoede", gender: "Female", tone: "Breezy, warm" },
  { id: "Leda", label: "Leda", gender: "Female", tone: "Youthful" },
  { id: "Zephyr", label: "Zephyr", gender: "Female", tone: "Bright" },
  { id: "Puck", label: "Puck", gender: "Male", tone: "Upbeat" },
  { id: "Charon", label: "Charon", gender: "Male", tone: "Informative" },
  { id: "Fenrir", label: "Fenrir", gender: "Male", tone: "Excitable" },
  { id: "Orus", label: "Orus", gender: "Male", tone: "Deep, firm" },
] as const;

export const MIN_SECONDS = 20;
export const MAX_SECONDS = 60;

export function defaultData(partial: Partial<ProjectData> = {}): ProjectData {
  return {
    durationTarget: 30,
    aspect: "landscape",
    style: "Cinematic",
    language: "English",
    voice: "Kore",
    speed: 1,
    scenes: [],
    originalVolume: 1,
    voiceVolume: 1,
    musicVolume: 0.25,
    subtitles: true,
    overlays: [],
    ...partial,
  };
}

export function keptScenes(d: ProjectData) {
  return d.scenes.filter((s) => s.keep);
}

/** Effective seconds of a scene in the final cut (narration may extend an AI scene). */
export function sceneLength(s: Scene, speed = 1): number {
  if (s.source === "original" && s.start != null && s.end != null) return Math.max(0, s.end - s.start);
  const narr = s.narrationDuration ? s.narrationDuration / speed + 0.3 : 0;
  return Math.max(s.duration, narr);
}

export function totalLength(d: ProjectData): number {
  return keptScenes(d).reduce((a, s) => a + sceneLength(s, d.speed), 0);
}

export function validateLength(seconds: number): string | null {
  if (seconds < MIN_SECONDS) return `Final video is ${seconds.toFixed(1)}s — it must be at least ${MIN_SECONDS}s.`;
  if (seconds > MAX_SECONDS) return `Final video is ${seconds.toFixed(1)}s — it must be ${MAX_SECONDS}s or less.`;
  return null;
}

export function aspectSize(a: Aspect): { w: number; h: number; ratio: "16:9" | "9:16" } {
  if (a === "portrait") return { w: 720, h: 1280, ratio: "9:16" };
  if (a === "square") return { w: 1080, h: 1080, ratio: "16:9" };
  return { w: 1280, h: 720, ratio: "16:9" };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}
