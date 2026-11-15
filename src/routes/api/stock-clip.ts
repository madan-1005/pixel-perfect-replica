import { createFileRoute } from "@tanstack/react-router";

// Proxies free Pexels stock video (search + download) so the browser can use it in the canvas renderer.
export const Route = createFileRoute("/api/stock-clip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const key = request.headers.get("x-pexels-key") || process.env["PEXELS_API_KEY"];
        if (!key) return new Response("Missing Pexels key. Add it in Settings.", { status: 400 });
        const query = u.searchParams.get("query") ?? "";
        const orientation = u.searchParams.get("orientation") === "portrait" ? "portrait" : "landscape";
        const want = Number(u.searchParams.get("seconds") ?? 5);
        const s = await fetch(`https://api.pexels.com/videos/search?${new URLSearchParams({ query, orientation, per_page: "15", size: "medium" })}`, { headers: { Authorization: key } });
        if (s.status === 401 || s.status === 403) return new Response("Your Pexels key was rejected. Check it in Settings.", { status: 400 });
        if (!s.ok) return new Response(`Pexels search failed (${s.status}).`, { status: 502 });
        const j = (await s.json()) as { videos: { duration: number; video_files: { link: string; width: number; height: number; file_type: string }[] }[] };
        const vids = j.videos.filter((v) => v.duration >= want) ;
        const pool = vids.length ? vids : j.videos;
        if (!pool.length) return new Response(`No stock clips found for "${query}". Edit the scene's visual keywords.`, { status: 404 });
        const v = pool[Math.floor(Math.random() * Math.min(5, pool.length))];
        const files = v.video_files.filter((f) => f.file_type === "video/mp4").sort((a, b) => Math.abs(Math.min(a.width, a.height) - 720) - Math.abs(Math.min(b.width, b.height) - 720));
        const f = files[0];
        if (!f) return new Response("No MP4 version of that clip.", { status: 404 });
        const d = await fetch(f.link);
        if (!d.ok || !d.body) return new Response("Clip download failed.", { status: 502 });
        return new Response(d.body, { headers: { "content-type": "video/mp4" } });
      },
    },
  },
});
