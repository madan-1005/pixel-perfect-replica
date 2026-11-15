import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Mic, Play } from "lucide-react";
import { PageHeader } from "@/components/studio/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateVoice } from "@/lib/studio/local-ai";
import { currentUserId, errMsg, signedUrl } from "@/lib/studio/media";
import { LANGUAGES, VOICES } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/voice")({
  head: () => ({ meta: [{ title: "AI Voice Generator — Reel Studio" }, { name: "description", content: "Turn text into natural voiceovers in many languages." }, { property: "og:title", content: "AI Voice Generator — Reel Studio" }, { property: "og:description", content: "Turn text into natural voiceovers." }] }),
  component: Voice,
});

function Voice() {
  const speak = generateVoice;
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("Kore");
  const [gender, setGender] = useState<"All" | "Female" | "Male">("All");
  const [language, setLanguage] = useState("English");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState<string>();
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed, url]);

  async function run(t: string, preview: boolean) {
    if (!t.trim()) return toast.error("Enter some text first.");
    setBusy(preview ? "preview" : "full");
    try {
      const path = `${await currentUserId()}/voice/${preview ? `preview-${voice}` : `voice-${Date.now()}`}.wav`;
      const r = await speak({ data: { text: t, voice, language, path } });
      setUrl(await signedUrl(r.path));
      setTimeout(() => audio.current?.play(), 100);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  }

  const list = VOICES.filter((v) => gender === "All" || v.gender === gender);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Voice" title="AI Voice Generator" desc="Pick a voice, preview it, then generate a full voiceover from your text." />
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-4 rounded-2xl border bg-card p-6">
          <Textarea rows={10} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste your script…" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Language</Label><Select value={language} onValueChange={setLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-3"><div className="flex justify-between"><Label>Speed</Label><span className="timecode text-sm text-primary">{speed.toFixed(2)}×</span></div><Slider min={0.75} max={1.5} step={0.05} value={[speed]} onValueChange={(v) => setSpeed(v[0])} /></div>
          </div>
          <Button variant="hero" className="w-full" onClick={() => run(text, false)} disabled={!!busy}>{busy === "full" ? <Loader2 className="animate-spin" /> : <Mic />} Generate voice</Button>
          {url && (
            <div className="flex items-center gap-2"><audio ref={audio} src={url} controls className="flex-1" /><Button asChild size="icon" variant="secondary"><a href={url} download="voiceover.wav" aria-label="Download"><Download /></a></Button></div>
          )}
          <p className="text-xs text-muted-foreground">Speed changes playback here and in rendered videos; the downloaded file is at normal speed.</p>
        </div>
        <div className="space-y-2">
          <div className="flex gap-1">{(["All", "Female", "Male"] as const).map((g) => <Button key={g} size="sm" variant={gender === g ? "default" : "ghost"} onClick={() => setGender(g)}>{g}</Button>)}</div>
          {list.map((v) => (
            <div key={v.id} onClick={() => setVoice(v.id)} className={cn("flex cursor-pointer items-center justify-between rounded-xl border bg-card p-3", voice === v.id && "border-primary bg-primary/10")}>
              <div><p className="font-medium">{v.label}</p><p className="text-xs text-muted-foreground">{v.gender} · {v.tone}</p></div>
              <Button size="icon" variant="ghost" aria-label={`Preview ${v.label}`} disabled={!!busy} onClick={(e) => { e.stopPropagation(); setVoice(v.id); void run(language === "English" ? `Hi, I'm ${v.label}. I can narrate your next video.` : `Introduce yourself as ${v.label}, a narrator, in one short sentence.`, true); }}>
                {busy === "preview" && voice === v.id ? <Loader2 className="animate-spin" /> : <Play />}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
