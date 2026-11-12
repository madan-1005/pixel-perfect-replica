import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Download, Film, FolderOpen, LayoutDashboard, LogOut, Mic, Scissors, Upload, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
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
] as const;

function Shell() {
  const { user } = Route.useRouteContext();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
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
        <div className="border-t border-sidebar-border pt-4">
          <p className="truncate px-2 text-xs text-muted-foreground">{user.email}</p>
          <button onClick={signOut} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
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
