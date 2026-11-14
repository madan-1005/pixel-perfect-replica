import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/studio/PageHeader";
import { Button } from "@/components/ui/button";
import { projectsQuery } from "@/lib/studio/queries";
import { signedUrl, type ProjectRow } from "@/lib/studio/media";

export const Route = createFileRoute("/_authenticated/downloads")({
  head: () => ({ meta: [{ title: "Downloads — Reel Studio" }, { name: "description", content: "Download your rendered videos." }, { property: "og:title", content: "Downloads — Reel Studio" }, { property: "og:description", content: "Download your rendered videos." }] }),
  component: Downloads,
});

function Item({ p }: { p: ProjectRow }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { signedUrl(p.final_video_path!).then(setUrl).catch(() => undefined); }, [p.final_video_path]);
  return (
    <div className="rounded-xl border bg-card p-3">
      {url ? <video src={url} controls playsInline className="aspect-video w-full rounded-lg bg-black" /> : <div className="aspect-video rounded-lg bg-muted" />}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Link to="/editor/$id" params={{ id: p.id }} className="truncate font-medium hover:text-primary">{p.title}</Link>
        {url && <Button asChild size="sm" variant="hero"><a href={url} download target="_blank" rel="noreferrer"><Download /> {p.final_video_path!.split(".").pop()?.toUpperCase()}</a></Button>}
      </div>
    </div>
  );
}

function Downloads() {
  const { data = [], isLoading } = useQuery(projectsQuery());
  const done = data.filter((p) => p.final_video_path);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Export" title="Download Video" desc="Every video you've rendered, ready to download." />
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : done.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No rendered videos yet. Open a project and press Render.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{done.map((p) => <Item key={p.id} p={p} />)}</div>}
    </div>
  );
}
