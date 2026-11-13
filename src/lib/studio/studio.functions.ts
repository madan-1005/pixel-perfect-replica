import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SOCIAL = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|vimeo\.com|snapchat\.com|linkedin\.com|threads\.net)$/i;
const BUCKET = "media";

export const generateScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: z.enum(["create", "improve"]),
        prompt: z.string().max(4000).optional(),
        transcript: z.string().max(20000).optional(),
        seconds: z.number().min(20).max(60),
        style: z.string().min(1).max(60),
        language: z.string().min(1).max(40),
        sceneCount: z.number().int().min(1).max(15).optional(),
      })
      .refine((v) => (v.mode === "create" ? !!v.prompt?.trim() : !!v.transcript?.trim()), "Prompt or transcript is required")
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { writeScript } = await import("./ai.server");
    return writeScript(data);
  });

export const generateVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().trim().min(1).max(3000), voice: z.string().min(1).max(30), language: z.string().min(1).max(40), path: z.string().min(1).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Invalid storage path");
    const { speak } = await import("./ai.server");
    const a = await speak(data.text, data.voice, data.language);
    const { error } = await context.supabase.storage.from(BUCKET).upload(data.path, a.bytes, { contentType: a.contentType, upsert: true });
    if (error) throw new Error(`Could not save narration: ${error.message}`);
    return { path: data.path, duration: a.duration };
  });

export const transcribeChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ wavBase64: z.string().min(10).max(4_000_000), language: z.string().max(40).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { transcribe } = await import("./ai.server");
    const bytes = Uint8Array.from(atob(data.wavBase64), (c) => c.charCodeAt(0));
    return { text: (await transcribe(bytes.buffer, data.language)).trim() };
  });

export const startSceneClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ prompt: z.string().trim().min(3).max(2000), style: z.string().max(60), ratio: z.enum(["16:9", "9:16"]), seconds: z.number().min(3).max(10) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { startClip } = await import("./ai.server");
    return { jobId: await startClip(data.prompt, data.style, data.ratio, data.seconds) };
  });

export const pollSceneClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().min(3).max(200), path: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Invalid storage path");
    const { clipStatus, fetchClip } = await import("./ai.server");
    const s = await clipStatus(data.jobId);
    if (s.status === "failed") return { status: "failed" as const, error: s.error ?? "The video model could not generate this scene." };
    if (s.status !== "completed") return { status: "pending" as const, progress: s.progress };
    const bytes = await fetchClip(data.jobId);
    const { error } = await context.supabase.storage.from(BUCKET).upload(data.path, bytes, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Could not save clip: ${error.message}`);
    return { status: "ready" as const, path: data.path };
  });

export const generateMusicTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ prompt: z.string().trim().min(3).max(500), path: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Invalid storage path");
    const { compose } = await import("./ai.server");
    const m = await compose(data.prompt);
    const { error } = await context.supabase.storage.from(BUCKET).upload(data.path, m.bytes, { contentType: m.contentType, upsert: true });
    if (error) throw new Error(`Could not save music: ${error.message}`);
    return { path: data.path };
  });

export const importFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().url().max(2000), path: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Invalid storage path");
    const u = new URL(data.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) links are supported.");
    if (SOCIAL.test(u.hostname)) {
      throw new Error(
        `Direct importing from ${u.hostname} isn't available: these platforms require sign-in or protect their videos, and we never bypass that. If you own the video or have permission, download it from the platform and upload the file here.`,
      );
    }
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) throw new Error("That address isn't allowed.");
    const res = await fetch(u.toString(), { redirect: "follow" });
    if (!res.ok) throw new Error(`The link returned an error (${res.status}). Make sure it is publicly accessible.`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("video/")) throw new Error("That link is a web page, not a video file. Paste a direct link to an .mp4/.webm/.mov file, or upload the video.");
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 100 * 1024 * 1024) throw new Error("Video is larger than 100 MB. Trim it or upload a smaller file.");
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("Video is larger than 100 MB.");
    const { error } = await context.supabase.storage.from(BUCKET).upload(data.path, bytes, { contentType: type, upsert: true });
    if (error) throw new Error(`Could not save video: ${error.message}`);
    return { path: data.path, contentType: type };
  });
