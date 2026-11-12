/** Browser-side audio analysis: decode, find speech/silence boundaries, encode WAV chunks. */
const RATE = 16000;

export async function decodeMono(src: Blob): Promise<Float32Array | null> {
  const buf = await src.arrayBuffer();
  const AC = window.AudioContext;
  const ac = new AC();
  try {
    const decoded = await ac.decodeAudioData(buf);
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
    const node = off.createBufferSource();
    node.buffer = decoded;
    node.connect(off.destination);
    node.start();
    const out = await off.startRendering();
    return out.getChannelData(0);
  } catch {
    return null; // no audio track
  } finally {
    void ac.close();
  }
}

/** Split the timeline into scene-sized segments, cutting in the middle of silences. */
export function segment(samples: Float32Array, minLen = 2.5, maxLen = 10): { start: number; end: number }[] {
  const frame = Math.round(RATE * 0.05);
  const n = Math.floor(samples.length / frame);
  const rms: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * frame; j < (i + 1) * frame; j++) s += samples[j] * samples[j];
    rms.push(Math.sqrt(s / frame));
  }
  const total = samples.length / RATE;
  const sorted = [...rms].sort((a, b) => a - b);
  const noise = sorted[Math.floor(sorted.length * 0.15)] ?? 0;
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const thr = Math.max(0.006, noise + (loud - noise) * 0.12);
  const cuts: number[] = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const silent = i < n && rms[i] < thr;
    if (silent && runStart < 0) runStart = i;
    if (!silent && runStart >= 0) {
      if ((i - runStart) * 0.05 >= 0.3) cuts.push(((runStart + i) / 2) * 0.05);
      runStart = -1;
    }
  }
  const bounds = [0, ...cuts.filter((c) => c > 0.5 && c < total - 0.5), total];
  let segs = bounds.slice(1).map((e, i) => ({ start: bounds[i], end: e }));
  // merge short
  const merged: { start: number; end: number }[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && (last.end - last.start < minLen || s.end - s.start < minLen * 0.5) && s.end - last.start <= maxLen) last.end = s.end;
    else merged.push({ ...s });
  }
  // split long
  segs = [];
  for (const s of merged) {
    const len = s.end - s.start;
    const parts = Math.ceil(len / maxLen);
    for (let p = 0; p < parts; p++) segs.push({ start: s.start + (len * p) / parts, end: s.start + (len * (p + 1)) / parts });
  }
  return segs.map((s) => ({ start: +s.start.toFixed(2), end: +s.end.toFixed(2) }));
}

export function evenSegments(total: number, len = 5) {
  const parts = Math.max(1, Math.round(total / len));
  return Array.from({ length: parts }, (_, i) => ({ start: +((total * i) / parts).toFixed(2), end: +((total * (i + 1)) / parts).toFixed(2) }));
}

export function wavBase64(samples: Float32Array, start: number, end: number): string {
  const a = Math.floor(start * RATE);
  const b = Math.min(samples.length, Math.floor(end * RATE));
  const len = Math.max(0, b - a);
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + len * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    const x = Math.max(-1, Math.min(1, samples[a + i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function hasSpeech(samples: Float32Array, start: number, end: number) {
  const a = Math.floor(start * RATE);
  const b = Math.min(samples.length, Math.floor(end * RATE));
  let s = 0;
  for (let i = a; i < b; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / Math.max(1, b - a)) > 0.01;
}

export function mediaDuration(url: string, kind: "video" | "audio" = "video"): Promise<number> {
  return new Promise((res, rej) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.onloadedmetadata = () => res(el.duration);
    el.onerror = () => rej(new Error("Could not read this media file. Try MP4 (H.264) or WebM."));
    el.src = url;
  });
}
