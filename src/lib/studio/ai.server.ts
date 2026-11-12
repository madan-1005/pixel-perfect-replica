import {
  GatewayError,
  generateMusic,
  generateResponse,
  generateSpeech,
  generateVideo,
  getVideo,
  downloadVideo,
  transcribeAudio,
} from "@lovable.dev/ai-gateway";

export function friendlyError(e: unknown): Error {
  if (e instanceof GatewayError) {
    switch (e.code) {
      case "configuration_error":
      case "authentication_error":
        return new Error("AI provider is not configured: the AI service key is missing or invalid. Add it in project settings and try again.");
      case "payment_required":
        return new Error("Your AI credits are used up. Add credits in workspace settings to keep generating.");
      case "rate_limited":
        return new Error("Too many AI requests right now. Wait a moment and try again.");
      case "permission_denied":
        return new Error(`The AI provider declined this request: ${e.message}`);
      case "request_rejected":
        return new Error(`The AI provider rejected this request: ${e.message}`);
      default:
        return new Error(`AI request failed: ${e.message}`);
    }
  }
  return e instanceof Error ? e : new Error(String(e));
}

function responseText(r: unknown): string {
  const any = r as { output_text?: string; output?: { content?: { type: string; text?: string }[] }[] };
  if (typeof any.output_text === "string" && any.output_text) return any.output_text;
  const parts: string[] = [];
  for (const o of any.output ?? []) for (const c of o.content ?? []) if (c.type === "output_text" && c.text) parts.push(c.text);
  return parts.join("");
}

export interface ScriptResult {
  title: string;
  scenes: { text: string; visualPrompt: string; seconds: number }[];
}

export async function writeScript(opts: {
  mode: "create" | "improve";
  prompt?: string;
  transcript?: string;
  seconds: number;
  style: string;
  language: string;
}): Promise<ScriptResult> {
  if (!process.env["LOVABLE_API_KEY"]) throw new Error("AI provider is not configured: LOVABLE_API_KEY is missing on the server.");
  const sceneCount = Math.max(3, Math.min(10, Math.round(opts.seconds / 6)));
  const wordsBudget = Math.round(opts.seconds * 2.3);
  const instructions =
    opts.mode === "create"
      ? `You are a senior video scriptwriter. Turn the user's idea into a ${opts.seconds}-second narrated video in ${opts.language}. Write exactly ${sceneCount} scenes. Total narration about ${wordsBudget} words. Open with a strong hook and end with a memorable conclusion. For each scene give the narration (in ${opts.language}) and a vivid English visual prompt for an AI video model in "${opts.style}" style describing subject, motion and camera — no text or captions in the shot. Seconds per scene must be between 3 and 10 and sum to about ${opts.seconds}.`
      : `You are a senior video editor. Rewrite this video transcript into an improved voiceover in ${opts.language}: fix grammar, tighten storytelling, remove repetition, write a more engaging introduction and a stronger conclusion. Keep the meaning. Target ${opts.seconds} seconds (about ${wordsBudget} words) split into ${sceneCount} scenes. For each scene also give an English visual prompt in "${opts.style}" style that could be used to generate a replacement shot. Seconds per scene between 3 and 10.`;
  const input = opts.mode === "create" ? `Idea: ${opts.prompt}` : `Transcript:\n${opts.transcript}`;
  try {
    const r = await generateResponse({
      model: "openai/gpt-6-astra",
      instructions,
      input: [{ role: "user", content: `${input}\n\nReturn JSON.` }],
      text: {
        format: {
          type: "json_schema",
          name: "script",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "scenes"],
            properties: {
              title: { type: "string" },
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["text", "visualPrompt", "seconds"],
                  properties: {
                    text: { type: "string" },
                    visualPrompt: { type: "string" },
                    seconds: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    });
    const parsed = JSON.parse(responseText(r)) as ScriptResult;
    if (!parsed.scenes?.length) throw new Error("The AI returned an empty script. Try rephrasing your prompt.");
    parsed.scenes = parsed.scenes.map((s) => ({ ...s, seconds: Math.max(3, Math.min(10, Math.round(s.seconds))) }));
    return parsed;
  } catch (e) {
    throw friendlyError(e);
  }
}

function wavDuration(buf: ArrayBuffer): number {
  const v = new DataView(buf);
  // walk RIFF chunks
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const size = v.getUint32(off + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(off + 16, true);
    if (id === "data" && byteRate) return Math.min(size, v.byteLength - off - 8) / byteRate;
    off += 8 + size + (size % 2);
  }
  return 0;
}

export async function speak(text: string, voice: string, language: string) {
  if (!process.env["LOVABLE_API_KEY"]) throw new Error("AI provider is not configured: LOVABLE_API_KEY is missing on the server.");
  try {
    const a = await generateSpeech({
      model: "google/gemini-3.1-flash-tts-preview",
      contents: [{ role: "user", parts: [{ text: `Read the following in ${language}, naturally and clearly, as a video voiceover:\n\n${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    const blob = await a.blob();
    const buf = await blob.arrayBuffer();
    return { bytes: buf, contentType: a.contentType || "audio/wav", duration: wavDuration(buf) };
  } catch (e) {
    throw friendlyError(e);
  }
}

export async function transcribe(bytes: ArrayBuffer, language?: string) {
  try {
    const r = await transcribeAudio({
      model: "openai/gpt-transcribe",
      file: new File([bytes], "chunk.wav", { type: "audio/wav" }),
      ...(language ? { prompt: `The speech may be in ${language}.` } : {}),
    });
    return typeof r === "string" ? r : (r as { text?: string }).text ?? "";
  } catch (e) {
    throw friendlyError(e);
  }
}

export async function startClip(prompt: string, style: string, ratio: "16:9" | "9:16", seconds: number) {
  if (!process.env["LOVABLE_API_KEY"]) throw new Error("AI provider is not configured: LOVABLE_API_KEY is missing on the server.");
  try {
    const job = await generateVideo({
      model: "google/gemini-omni-1.1-flash",
      input: `${prompt}. Visual style: ${style}. No on-screen text, no captions, no watermarks.`,
      response_format: { type: "video", duration: `${Math.max(3, Math.min(10, Math.round(seconds)))}s`, resolution: "720p", aspect_ratio: ratio },
    });
    return job.id;
  } catch (e) {
    throw friendlyError(e);
  }
}

export async function clipStatus(id: string) {
  try {
    const s = (await getVideo(id)) as { status: string; progress?: number; error?: { message?: string } };
    return { status: s.status, progress: s.progress ?? 0, error: s.error?.message };
  } catch (e) {
    throw friendlyError(e);
  }
}

export async function fetchClip(id: string) {
  try {
    const d = await downloadVideo(id);
    return await (await d.blob()).arrayBuffer();
  } catch (e) {
    throw friendlyError(e);
  }
}

export async function compose(prompt: string) {
  if (!process.env["LOVABLE_API_KEY"]) throw new Error("AI provider is not configured: LOVABLE_API_KEY is missing on the server.");
  try {
    const m = await generateMusic({ model: "google/lyria-3-clip-preview", input: `${prompt}. Instrumental only, no vocals, suitable as background music under narration.` });
    const blob = await m.blob();
    return { bytes: await blob.arrayBuffer(), contentType: m.contentType || "audio/mpeg" };
  } catch (e) {
    throw friendlyError(e);
  }
}
