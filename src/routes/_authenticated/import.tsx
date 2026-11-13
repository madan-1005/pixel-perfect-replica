import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Upload } from "lucide-react";
import { PageHeader } from "@/components/studio/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importFromUrl, transcribeChunk } from "@/lib/studio/studio.functions";
import { createProject, errMsg, projectPath, signedUrl, updateProject, uploadFile } from "@/lib/studio/media";
import { decodeMono, evenSegments, hasSpeech, mediaDuration, segment, wavBase64 } from "@/lib/studio/audio";
import { defaultData, LANGUAGES, uid, type Aspect, type Scene } from "@/lib/studio/types";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import Video — Reel Studio" }, { name: "description", content: "Import a video, extract audio and generate a timed transcript." }, { property: "og:title", content: "Import Video — Reel Studio" }, { property: "og:description", content: "Import a video and transcribe it." }] }),
  component: ImportPage,
});

function ImportPage() {
  const navigate = useNavigate();
  const fromUrl = useServerFn(importFromUrl);
  const transcribe = useServerFn(transcribeChunk);
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("English");
  const [stage, setStage] = useState<string | null>(null);
  const [pct, setPct] = useState(0);

  async function process(getFile: (projectId: string, path: string) => Promise<void>, title: string) {
    let projectId = "";
    try {
      setStage("Creating project…"); setPct(3);
      const p = await createProject(title, "import", defaultData({ language }));
      projectId = p.id;
      const path = await projectPath(p.id, "source.mp4");
      setStage("Importing video…"); setPct(10);
      await getFile(p.id, path);
      const src = await signedUrl(path);
      const dur = await mediaDuration(src);
      const v = document.createElement("video");
      v.src = src; await new Promise((r) => (v.onloadedmetadata = r));
      const aspect: Aspect = v.videoHeight > v.videoWidth * 1.1 ? "portrait" : Math.abs(v.videoHeight - v.videoWidth) < v.videoWidth * 0.1 ? "square" : "landscape";
      setStage("Extracting audio…"); setPct(25);
      const blob = await (await fetch(src)).blob();
      const samples = await decodeMono(blob);
      const segs = samples ? segment(samples) : evenSegments(dur);
      const scenes: Scene[] = [];
      for (let i = 0; i < segs.length; i++) {
        setStage(`Transcribing scene ${i + 1} of ${segs.length}…`); setPct(30 + (65 * i) / segs.length);
        const s = segs[i];
        let text = "";
        if (samples && hasSpeech(samples, s.start, s.end)) text = (await transcribe({ data: { wavBase64: wavBase64(samples, s.start, s.end), language } })).text;
        scenes.push({ id: uid(), text, visualPrompt: "", duration: s.end - s.start, source: "original", keep: true, start: s.start, end: s.end });
      }
      await updateProject(p.id, { status: "transcribed", data: defaultData({ language, aspect, sourceVideoPath: path, sourceDuration: dur, scenes }) });
      setPct(100);
      if (!samples) toast.warning("This video has no readable audio track, so there is no transcript. You can still edit scenes and add narration.");
      else toast.success("Video imported and transcribed.");
      navigate({ to: "/editor/$id", params: { id: p.id } });
    } catch (e) {
      toast.error(errMsg(e));
      if (projectId) await updateProject(projectId, { status: "failed" }).catch(() => undefined);
      setStage(null);
    }
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("video/")) return toast.error("Choose a video file (MP4, WebM or MOV).");
    if (f.size > 200 * 1024 * 1024) return toast.error("Videos up to 200 MB are supported.");
    void process(async (_id, path) => { await uploadFile(path, f); }, f.name.replace(/\.[^.]+$/, ""));
  }
  function onUrl() {
    try { new URL(url); } catch { return toast.error("Paste a valid link."); }
    void process(async (_id, path) => { await fromUrl({ data: { url, path } }); }, new URL(url).pathname.split("/").pop() || "Imported video");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Import" title="Import Video" desc="Bring in a video you own or have permission to use. We extract the audio, split it into scenes at natural pauses and transcribe each one." />
      {stage ? (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-4 font-medium">{stage}</p>
          <Progress value={pct} className="mt-4" />
          <p className="mt-3 text-xs text-muted-foreground">Keep this tab open.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2 rounded-2xl border bg-card p-6">
            <Label>Spoken language</Label>
            <Select value={language} onValueChange={setLanguage}><SelectTrigger className="w-60"><SelectValue /></SelectTrigger><SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select>
          </div>
          <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed bg-card p-10 text-center transition hover:border-primary/60">
            <Upload className="size-8 text-primary" />
            <p className="mt-3 font-medium">Upload a video</p>
            <p className="text-sm text-muted-foreground">MP4, WebM or MOV · up to 200 MB</p>
            <input type="file" accept="video/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <div className="rounded-2xl border bg-card p-6">
            <Label className="flex items-center gap-2"><Link2 className="size-4" /> Or paste a link</Label>
            <div className="mt-2 flex gap-2"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/video.mp4" /><Button onClick={onUrl}>Import</Button></div>
            <p className="mt-3 text-xs text-muted-foreground">Works with direct, publicly accessible video file links. YouTube, Instagram, TikTok, Facebook and X protect their videos behind sign-in — we never bypass that. Download a video you own from the platform and upload it instead.</p>
          </div>
        </div>
      )}
    </div>
  );
}
