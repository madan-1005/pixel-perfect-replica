import { createFileRoute } from "@tanstack/react-router";

const SOCIAL = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|vimeo\.com|snapchat\.com|linkedin\.com|threads\.net)$/i;

// Downloads a direct public video file link for import (no social platforms, no private addresses).
export const Route = createFileRoute("/api/fetch-video")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let u: URL;
        try {
          u = new URL(new URL(request.url).searchParams.get("url") ?? "");
        } catch {
          return new Response("That isn't a valid link.", { status: 400 });
        }
        if (u.protocol !== "https:" && u.protocol !== "http:") return new Response("Only http(s) links are supported.", { status: 400 });
        if (SOCIAL.test(u.hostname))
          return new Response(`Direct importing from ${u.hostname} isn't available: these platforms protect their videos and we never bypass that. If you own the video, download it and upload the file here.`, { status: 400 });
        if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(u.hostname)) return new Response("That address isn't allowed.", { status: 400 });
        const res = await fetch(u.toString(), { redirect: "follow" });
        if (!res.ok || !res.body) return new Response(`The link returned an error (${res.status}).`, { status: 400 });
        const type = res.headers.get("content-type") ?? "";
        if (!type.startsWith("video/")) return new Response("That link is a web page, not a video file. Paste a direct .mp4/.webm link, or upload the video.", { status: 400 });
        if (Number(res.headers.get("content-length") ?? 0) > 100 * 1024 * 1024) return new Response("Video is larger than 100 MB.", { status: 400 });
        return new Response(res.body, { headers: { "content-type": type } });
      },
    },
  },
});
