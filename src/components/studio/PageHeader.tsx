import type { ReactNode } from "react";
export function PageHeader({ eyebrow, title, desc, actions }: { eyebrow?: string; title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="timecode mb-2 text-xs uppercase tracking-widest text-primary">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-muted-foreground">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}
