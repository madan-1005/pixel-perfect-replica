import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/studio/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateScript } from "@/lib/studio/local-ai";
import { createProject, errMsg } from "@/lib/studio/media";
import { defaultData, LANGUAGES, STYLES, VOICES, uid, type Aspect } from "@/lib/studio/types";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({ meta: [{ title: "Text to Video — Reel Studio" }, { name: "description", content: "Generate a narrated AI video from a prompt." }, { property: "og:title", content: "Text to Video — Reel Studio" }, { property: "og:description", content: "Generate a narrated AI video from a prompt." }] }),
  component: Create,
});

function Create() {
  const navigate = useNavigate();
  const script = generateScript;
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [aspect, setAspect] = useState<Aspect>("landscape");
  const [style, setStyle] = useState<string>("Cinematic");
  const [language, setLanguage] = useState<string>("English");
  const [voice, setVoice] = useState<string>("Kore");
  const [busy, setBusy] = useState(false);

  async function go() {
    if (prompt.trim().length < 10) return toast.error("Describe your video in at least a sentence.");
    setBusy(true);
    try {
      const r = await script({ data: { mode: "create", prompt, seconds, style, language } });
      const p = await createProject(
        r.title || prompt.slice(0, 50),
        "text_to_video",
        defaultData({
          prompt, durationTarget: seconds, aspect, style, language, voice,
          scenes: r.scenes.map((s) => ({ id: uid(), text: s.text, visualPrompt: s.visualPrompt, duration: s.seconds, source: "ai", keep: true, clipStatus: "idle" })),
        }),
      );
      toast.success("Script ready — review it, then generate scenes.");
      navigate({ to: "/editor/$id", params: { id: p.id } });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Generate" title="Text to Video" desc="Describe your idea. AI writes an improved script and splits it into scenes you can review before generating clips." />
      <div className="space-y-6 rounded-2xl border bg-card p-6">
        <div className="space-y-2"><Label>Prompt</Label><Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A 30 second story about how a small coffee farm in Coorg grows the perfect bean…" maxLength={4000} /></div>
        <div className="space-y-3">
          <div className="flex justify-between"><Label>Duration</Label><span className="timecode text-sm text-primary">{seconds}s</span></div>
          <Slider min={20} max={60} step={5} value={[seconds]} onValueChange={(v) => setSeconds(v[0])} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Format" value={aspect} onChange={(v) => setAspect(v as Aspect)} items={[["landscape", "Landscape 16:9"], ["portrait", "Portrait 9:16"], ["square", "Square 1:1"]]} />
          <Field label="Visual style" value={style} onChange={setStyle} items={STYLES.map((s) => [s, s])} />
          <Field label="Narration language" value={language} onChange={setLanguage} items={LANGUAGES.map((s) => [s, s])} />
          <Field label="Voice" value={voice} onChange={setVoice} items={VOICES.map((v) => [v.id, `${v.label} · ${v.gender} · ${v.tone}`])} />
        </div>
        <Button variant="hero" size="lg" className="w-full" onClick={go} disabled={busy}>
          {busy ? <><Loader2 className="animate-spin" /> Writing script…</> : <><Wand2 /> Generate improved script</>}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, items }: { label: string; value: string; onChange: (v: string) => void; items: readonly (readonly [string, string])[] }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{items.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
