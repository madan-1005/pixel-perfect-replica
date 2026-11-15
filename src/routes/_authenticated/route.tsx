import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Clapperboard, Download, Film, FolderOpen, LayoutDashboard, Mic, Settings, Scissors, Upload, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Shell,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/create", label: "Text to Video", icon: Wand2 },
  { to: "/import", label: "Import Video", icon: Upload },
  { to: "/editor", label: "Video Editor", icon: Scissors },
  { to: "/voice", label: "AI Voice", icon: Mic },
  { to: "/projects", label: "My Projects", icon: FolderOpen },
  { to: "/downloads", label: "Downloads", icon: Download },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Shell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <Link to="/dashboard" className="mb-8 flex items-center gap-2 px-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-primary text-primary-foreground"><Clapperboard className="size-4" /></span>
          Reel Studio
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => {
            const active = path === n.to || path.startsWith(n.to + "/");
            return (
              <Link key={n.to} to={n.to} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition hover:bg-sidebar-accent hover:text-sidebar-foreground", active && "bg-sidebar-accent text-sidebar-foreground")}>
                <n.icon className={cn("size-4", active && "text-primary")} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <p className="border-t border-sidebar-border px-2 pt-4 text-xs text-muted-foreground">Free · saved on this computer</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b px-3 py-2 md:hidden">
          <Film className="size-5 shrink-0 text-primary" />
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground" activeProps={{ className: "bg-accent text-foreground" }}>{n.label}</Link>
          ))}
        </header>
        <main className="flex-1 p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
