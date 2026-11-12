import { Link } from "@tanstack/react-router";
import { Film, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProjectRow } from "@/lib/studio/media";
import { fmtTime, totalLength } from "@/lib/studio/types";

export function ProjectCard({ p }: { p: ProjectRow }) {
  const Icon = p.kind === "import" ? Upload : Film;
  return (
    <Link to="/editor/$id" params={{ id: p.id }} className="group rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-glow">
      <div className="mb-3 flex aspect-video items-center justify-center rounded-lg bg-muted">
        <Icon className="size-8 text-muted-foreground transition group-hover:text-primary" />
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{p.title}</p>
          <p className="timecode text-xs text-muted-foreground">{p.data.scenes.length} scenes · {fmtTime(totalLength(p.data))}</p>
        </div>
        <Badge variant={p.status === "rendered" ? "default" : "secondary"}>{p.status}</Badge>
      </div>
    </Link>
  );
}
