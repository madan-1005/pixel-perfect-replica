import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/studio/PageHeader";
import { ProjectCard } from "@/components/studio/ProjectCard";
import { Button } from "@/components/ui/button";
import { projectsQuery } from "@/lib/studio/queries";

export const Route = createFileRoute("/_authenticated/editor/")({
  head: () => ({ meta: [{ title: "Video Editor — Reel Studio" }, { name: "description", content: "Choose a project to edit." }, { property: "og:title", content: "Video Editor — Reel Studio" }, { property: "og:description", content: "Choose a project to edit." }] }),
  component: () => {
    const { data = [], isLoading } = useQuery(projectsQuery());
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader eyebrow="Edit" title="Video Editor" desc="Pick a project to open it on the timeline." actions={<div className="flex gap-2"><Button asChild variant="secondary"><Link to="/import">Import video</Link></Button><Button asChild variant="hero"><Link to="/create">New from text</Link></Button></div>} />
        {isLoading ? <p className="text-muted-foreground">Loading…</p> : data.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No projects yet.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{data.map((p) => <ProjectCard key={p.id} p={p} />)}</div>}
      </div>
    );
  },
});
