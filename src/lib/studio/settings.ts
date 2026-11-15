/** Free/local service settings, kept in this browser. */
export interface LocalSettings {
  ollamaUrl: string;
  ollamaModel: string;
  pexelsKey: string;
}
export const DEFAULT_SETTINGS: LocalSettings = { ollamaUrl: "http://localhost:11434", ollamaModel: "llama3.2", pexelsKey: "" };
export function loadSettings(): LocalSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("reel-settings") ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(s: LocalSettings) {
  localStorage.setItem("reel-settings", JSON.stringify(s));
}
