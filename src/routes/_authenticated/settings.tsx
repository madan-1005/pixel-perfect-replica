import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/studio/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type LocalSettings } from "@/lib/studio/settings";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Reel Studio" }, { name: "description", content: "Connect free local AI and stock footage." }, { property: "og:title", content: "Settings — Reel Studio" }, { property: "og:description", content: "Connect free local AI and stock footage." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [s, setS] = useState<LocalSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<string>("");
  useEffect(() => setS(loadSettings()), []);
  async function test() {
    try {
      const r = await fetch(`${s.ollamaUrl.replace(/\/$/, "")}/api/tags`);
      const j = (await r.json()) as { models: { name: string }[] };
      const names = j.models.map((m) => m.name);
      setStatus(names.some((n) => n.startsWith(s.ollamaModel)) ? `Connected. "${s.ollamaModel}" is installed.` : `Connected, but "${s.ollamaModel}" isn't installed. Run: ollama pull ${s.ollamaModel}`);
    } catch {
      setStatus("Can't reach Ollama. Make sure it's running and you opened this app at http://localhost.");
    }
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Free setup" title="Settings" desc="Everything here is free. Your projects are saved in this browser on your computer." />
      <div className="space-y-6 rounded-2xl border bg-card p-6">
        <div className="space-y-2">
          <Label>Ollama address (writes scripts)</Label>
          <Input value={s.ollamaUrl} onChange={(e) => setS({ ...s, ollamaUrl: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Ollama model</Label>
          <Input value={s.ollamaModel} onChange={(e) => setS({ ...s, ollamaModel: e.target.value })} />
          <p className="text-xs text-muted-foreground">Install from ollama.com, then run <code>ollama pull {s.ollamaModel}</code>.</p>
        </div>
        <div className="space-y-2">
          <Label>Pexels key (free stock video clips)</Label>
          <Input type="password" value={s.pexelsKey} onChange={(e) => setS({ ...s, pexelsKey: e.target.value })} placeholder="Get one free at pexels.com/api" />
        </div>
        <p className="text-xs text-muted-foreground">Voices and transcription run inside your browser. The first use downloads the free models once (about 100–150 MB).</p>
        <div className="flex gap-2">
          <Button onClick={() => { saveSettings(s); toast.success("Saved"); }}>Save</Button>
          <Button variant="secondary" onClick={test}>Test Ollama</Button>
        </div>
        {status && <p className="text-sm">{status}</p>}
      </div>
    </div>
  );
}
