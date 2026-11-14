import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/studio/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { projectsQuery } from "@/lib/studio/queries";
import { deleteProject, errMsg } from "@/lib/studio/media";
import { fmtTime, totalLength } from "@/lib/studio/types";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "My Projects — Reel Studio" }, { name: "description", content: "All your video projects." }, { property: "og:title", content: "My Projects — Reel Studio" }, { property: "og:description", content: "All your video projects." }] }),
  component: Projects,
});

function Projects() {
  const qc = useQueryClient();
  const { data = [], isLoading, error } = useQuery(projectsQuery());
  async function del(id: string) {
    if (!confirm("Delete this project and all its media?")) return;
    try { await deleteProject(id); qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project deleted"); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Library" title="My Projects" />
      {error && <p className="text-destructive">{(error as Error).message}</p>}
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : data.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No projects yet.</p> : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {data.map((p) => (
            <div key={p.id} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Link to="/editor/$id" params={{ id: p.id }} className="min-w-0 flex-1 hover:text-primary"><p className="truncate font-medium">{p.title}</p><p className="timecode text-xs text-muted-foreground">{p.kind === "import" ? "Imported" : "Text to video"} · {p.data.scenes.length} scenes · {fmtTime(totalLength(p.data))} · {new Date(p.updated_at).toLocaleString()}</p></Link>
              <Badge variant={p.status === "rendered" ? "default" : "secondary"}>{p.status}</Badge>
              <Button size="icon" variant="ghost" onClick={() => del(p.id)} aria-label="Delete project"><Trash2 /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
