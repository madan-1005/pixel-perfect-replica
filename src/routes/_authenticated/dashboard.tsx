import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mic, Upload, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/studio/PageHeader";
import { ProjectCard } from "@/components/studio/ProjectCard";
import { projectsQuery } from "@/lib/studio/queries";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Reel Studio" }, { name: "description", content: "Your AI video studio overview." }, { property: "og:title", content: "Dashboard — Reel Studio" }, { property: "og:description", content: "Your AI video studio overview." }] }),
  component: Dashboard,
});

const ACTIONS = [
  { to: "/create", icon: Wand2, t: "Text to Video", d: "Generate a narrated video from a prompt" },
  { to: "/import", icon: Upload, t: "Import Video", d: "Upload or link a video and transcribe it" },
  { to: "/voice", icon: Mic, t: "AI Voice", d: "Turn any text into a voiceover" },
] as const;

function Dashboard() {
  const { data = [], isLoading, error } = useQuery(projectsQuery());
  const rendered = data.filter((p) => p.final_video_path).length;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Studio" title="Dashboard" desc="Start something new or pick up where you left off." />
      <div className="grid gap-4 md:grid-cols-3">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="rounded-xl border bg-card p-5 transition hover:border-primary/50 hover:shadow-glow">
            <a.icon className="size-6 text-primary" />
            <p className="mt-4 font-medium">{a.t}</p>
            <p className="text-sm text-muted-foreground">{a.d}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-3 gap-4">
        {[["Projects", data.length], ["Rendered videos", rendered], ["Drafts", data.length - rendered]].map(([l, v]) => (
          <div key={l} className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{l}</p><p className="timecode mt-1 text-3xl">{v}</p></div>
        ))}
      </div>
      <h2 className="mb-4 mt-10 text-lg font-medium">Recent projects</h2>
      {error && <p className="text-destructive">{(error as Error).message}</p>}
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : data.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No projects yet — create your first video.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{data.slice(0, 8).map((p) => <ProjectCard key={p.id} p={p} />)}</div>
      )}
    </div>
  );
}
