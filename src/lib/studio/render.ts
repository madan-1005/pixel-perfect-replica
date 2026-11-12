import type { Overlay } from "./types";

export interface PlanScene {
  kind: "original" | "ai";
  videoUrl?: string;
  start: number;
  length: number;
  narrationUrl?: string;
  text: string;
}

export interface RenderPlan {
  w: number;
  h: number;
  scenes: PlanScene[];
  musicUrl?: string;
  originalVolume: number;
  voiceVolume: number;
  musicVolume: number;
  speed: number;
  subtitles: boolean;
  overlays: Overlay[];
}

export interface RenderOptions {
  record: boolean;
  onProgress?: (t: number, total: number) => void;
  signal?: AbortSignal;
}

function pickMime() {
  const c = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return c.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

function waitEvent(el: HTMLMediaElement, ev: string, ms = 20000) {
  return new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error("Media took too long to load.")), ms);
    el.addEventListener(ev, () => (clearTimeout(t), res()), { once: true });
    el.addEventListener("error", () => (clearTimeout(t), rej(new Error("A media file could not be loaded."))), { once: true });
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, W: number, H: number, pos: "top" | "center" | "bottom", size: number, boxed: boolean) {
  ctx.font = `600 ${size}px "Space Grotesk", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, text, W * 0.84);
  const lh = size * 1.3;
  const blockH = lines.length * lh;
  const y0 = pos === "top" ? H * 0.1 : pos === "center" ? H / 2 - blockH / 2 : H * 0.88 - blockH;
  lines.forEach((l, i) => {
    const y = y0 + i * lh + lh / 2;
    if (boxed) {
      const w = ctx.measureText(l).width + size;
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(W / 2 - w / 2, y - lh / 2, w, lh);
    } else {
      ctx.lineWidth = size / 6;
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.strokeText(l, W / 2, y);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillText(l, W / 2, y);
  });
}

function subtitleChunk(text: string, local: number, length: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const per = 7;
  const groups = Math.ceil(words.length / per);
  const g = Math.min(groups - 1, Math.floor((local / Math.max(0.1, length)) * groups));
  return words.slice(g * per, g * per + per).join(" ");
}

/** Plays the plan onto the canvas in real time; when record=true returns the encoded video. */
export async function renderPlan(plan: RenderPlan, canvas: HTMLCanvasElement, opts: RenderOptions): Promise<Blob | null> {
  canvas.width = plan.w;
  canvas.height = plan.h;
  const ctx = canvas.getContext("2d")!;
  const total = plan.scenes.reduce((a, s) => a + s.length, 0);
  const ac = new AudioContext();
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  const out = (g: GainNode) => {
    g.connect(dest);
    g.connect(ac.destination);
  };
  const cleanup: (() => void)[] = [];

  const mkVideo = async (url: string, vol: number) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    const g = ac.createGain();
    g.gain.value = vol;
    ac.createMediaElementSource(v).connect(g);
    out(g);
    await waitEvent(v, "loadeddata");
    cleanup.push(() => (v.pause(), v.removeAttribute("src"), v.load()));
    return v;
  };
  const mkAudio = async (url: string, vol: number, rate = 1) => {
    const a = new Audio();
    a.crossOrigin = "anonymous";
    a.preload = "auto";
    a.src = url;
    a.playbackRate = rate;
    const g = ac.createGain();
    g.gain.value = vol;
    ac.createMediaElementSource(a).connect(g);
    out(g);
    await waitEvent(a, "canplaythrough");
    a.playbackRate = rate;
    cleanup.push(() => (a.pause(), a.removeAttribute("src")));
    return a;
  };

  // preload everything up front (shared element per unique source URL)
  const videos = new Map<string, HTMLVideoElement>();
  for (const s of plan.scenes) {
    if (s.videoUrl && !videos.has(s.videoUrl)) videos.set(s.videoUrl, await mkVideo(s.videoUrl, s.kind === "original" ? plan.originalVolume : 0));
  }
  const narrations = await Promise.all(plan.scenes.map((s) => (s.narrationUrl ? mkAudio(s.narrationUrl, plan.voiceVolume, plan.speed) : Promise.resolve(null))));
  const music = plan.musicUrl ? await mkAudio(plan.musicUrl, plan.musicVolume) : null;
  if (music) music.loop = true;

  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  const mime = pickMime();
  if (opts.record) {
    if (!mime) throw new Error("This browser can't record video. Use a recent Chrome, Edge or Safari.");
    const stream = canvas.captureStream(30);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(250);
  }
  music?.play();

  let offset = 0;
  try {
    for (let i = 0; i < plan.scenes.length; i++) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const s = plan.scenes[i];
      const v = s.videoUrl ? videos.get(s.videoUrl)! : null;
      if (v) {
        v.loop = s.kind === "ai";
        v.currentTime = s.start;
        await waitEvent(v, "seeked").catch(() => undefined);
        await v.play();
      }
      const n = narrations[i];
      if (n) {
        n.currentTime = 0;
        void n.play();
      }
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const local = (performance.now() - t0) / 1000;
          if (local >= s.length || opts.signal?.aborted) return resolve();
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, plan.w, plan.h);
          if (v && v.videoWidth) {
            const sc = Math.max(plan.w / v.videoWidth, plan.h / v.videoHeight);
            const dw = v.videoWidth * sc;
            const dh = v.videoHeight * sc;
            ctx.drawImage(v, (plan.w - dw) / 2, (plan.h - dh) / 2, dw, dh);
          }
          const g = offset + local;
          const base = Math.round(Math.min(plan.w, plan.h) * 0.05);
          for (const o of plan.overlays) if (g >= o.start && g <= o.end) drawCaption(ctx, o.text, plan.w, plan.h, o.position, base * 1.3, false);
          if (plan.subtitles && s.text) drawCaption(ctx, subtitleChunk(s.text, local, s.length), plan.w, plan.h, "bottom", base * 0.8, true);
          opts.onProgress?.(g, total);
          requestAnimationFrame(tick);
        };
        tick();
      });
      v?.pause();
      n?.pause();
      offset += s.length;
    }
  } finally {
    music?.pause();
    let blob: Blob | null = null;
    if (recorder) {
      const done = new Promise<void>((r) => (recorder!.onstop = () => r()));
      recorder.stop();
      await done;
      blob = new Blob(chunks, { type: mime.split(";")[0] });
    }
    cleanup.forEach((c) => c());
    void ac.close();
    if (opts.signal?.aborted) return null;
    // eslint-disable-next-line no-unsafe-finally
    return blob;
  }
}
