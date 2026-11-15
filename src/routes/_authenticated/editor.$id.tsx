import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Check, Clapperboard, Download, Eye, EyeOff, Film, Loader2, Mic, Music, Play, Plus, RefreshCw, Sparkles, Square, Trash2, Type, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { projectQuery } from "@/lib/studio/queries";
import { errMsg, projectPath, signedUrl, updateProject, uploadFile } from "@/lib/studio/media";
import { generateMusicTrack, generateScript, generateVoice, pollSceneClip, startSceneClip } from "@/lib/studio/local-ai";
import { renderPlan, type PlanScene, type RenderPlan } from "@/lib/studio/render";
import {
  aspectSize, fmtTime, keptScenes, LANGUAGES, MAX_SECONDS, MIN_SECONDS, sceneLength, STYLES, totalLength, uid, validateLength, VOICES,
  type Overlay, type ProjectData, type Scene,
} from "@/lib/studio/types";

export const Route = createFileRoute("/_authenticated/editor/$id")({
  head: () => ({ meta: [{ title: "Video Editor — Reel Studio" }, { name: "description", content: "Edit scenes, script, voice, music and render your video." }, { property: "og:title", content: "Video Editor — Reel Studio" }, { property: "og:description", content: "Edit and render your AI video." }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(projectQuery(params.id)),
  component: Editor,
  errorComponent: ({ error }) => <div className="p-8"><p className="text-destructive">{(error as Error).message}</p><Link to="/projects" className="text-primary">Back to projects</Link></div>,
});

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: project } = useSuspenseQuery(projectQuery(id));
  const [title, setTitle] = useState(project.title);
  const [data, setDataState] = useState<ProjectData>(project.data);
  const dataRef = useRef(data);
  const [sel, setSel] = useState<string | null>(data.scenes[0]?.id ?? null);
  const [finalPath, setFinalPath] = useState(project.final_video_path);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setData = useCallback((fn: (d: ProjectData) => ProjectData) => {
    setDataState((prev) => {
      const next = fn(prev);
      dataRef.current = next;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateProject(id, { data: dataRef.current }).then(() => qc.invalidateQueries({ queryKey: ["projects"] })).catch((e) => toast.error(`Autosave failed: ${errMsg(e)}`));
      }, 700);
      return next;
    });
  }, [id, qc]);
  const patchScene = useCallback((sid: string, p: Partial<Scene>) => setData((d) => ({ ...d, scenes: d.scenes.map((s) => (s.id === sid ? { ...s, ...p } : s)) })), [setData]);

  useEffect(() => () => { clearTimeout(saveTimer.current); void updateProject(id, { data: dataRef.current }); }, [id]);

  const total = totalLength(data);
  const lengthError = validateLength(total);
  const scene = data.scenes.find((s) => s.id === sel) ?? null;
  const size = aspectSize(data.aspect);

  // ---------- AI clip generation ----------
  const startClip = startSceneClip;
  const pollClip = pollSceneClip;
  const polling = useRef(new Set<string>());
  const poll = useCallback(async (s: Scene) => {
    if (!s.clipJobId || polling.current.has(s.id)) return;
    polling.current.add(s.id);
    const path = await projectPath(id, `clip-${s.id}-${s.clipJobId.slice(-6)}.mp4`);
    try {
      for (let i = 0; i < 90; i++) {
        const r = await pollClip({ data: { jobId: s.clipJobId, path } });
        if (r.status === "ready") { patchScene(s.id, { clipStatus: "ready", clipPath: r.path, clipError: undefined }); return; }
        if (r.status === "failed") { patchScene(s.id, { clipStatus: "failed", clipError: r.error }); return; }
        await new Promise((res) => setTimeout(res, 5000));
      }
      patchScene(s.id, { clipStatus: "failed", clipError: "Timed out waiting for the video model." });
    } catch (e) {
      patchScene(s.id, { clipStatus: "failed", clipError: errMsg(e) });
    } finally {
      polling.current.delete(s.id);
    }
  }, [id, pollClip, patchScene]);

  useEffect(() => { data.scenes.filter((s) => s.clipStatus === "generating" && s.clipJobId).forEach((s) => void poll(s)); // resume after reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function genClip(s: Scene) {
    if (!s.visualPrompt.trim()) return toast.error("Add a visual prompt for this scene first.");
    patchScene(s.id, { clipStatus: "generating", clipError: undefined, source: "ai" });
    try {
      const len = s.source === "original" && s.start != null && s.end != null ? s.end - s.start : s.duration;
      const { jobId } = await startClip({ data: { prompt: s.visualPrompt, style: data.style, ratio: size.ratio, seconds: Math.max(3, Math.min(10, len)) } });
      const next = { ...s, source: "ai" as const, clipJobId: jobId, clipStatus: "generating" as const, duration: Math.max(3, Math.min(10, len)) };
      patchScene(s.id, { clipJobId: jobId, duration: next.duration });
      void poll(next);
    } catch (e) {
      patchScene(s.id, { clipStatus: "failed", clipError: errMsg(e) });
      toast.error(errMsg(e));
    }
  }
  async function genAllClips() {
    const todo = keptScenes(data).filter((s) => s.source === "ai" && !s.clipPath && s.clipStatus !== "generating");
    if (!todo.length) return toast.info("All AI scenes already have clips.");
    toast.info(`Finding ${todo.length} free stock clips…`);
    for (const s of todo) await genClip(s);
  }

  // ---------- Narration ----------
  const voiceFn = generateVoice;
  const [narrBusy, setNarrBusy] = useState(false);
  const voiceText = (s: Scene) => (s.narrationText ?? (s.source === "ai" && project.kind !== "import" ? s.text : s.source === "ai" ? s.text : "")).trim();
  async function genNarration(only?: Scene) {
    const list = only ? [only] : keptScenes(data).filter((s) => voiceText(s));
    if (!list.length) return toast.error("No narration text yet. Use “Improve My Video” or write scene text first.");
    setNarrBusy(true);
    try {
      for (const s of list) {
        const t = voiceText(s);
        if (!t) continue;
        const path = await projectPath(id, `narr-${s.id}-${Date.now()}.wav`);
        const r = await voiceFn({ data: { text: t, voice: data.voice, language: data.language, path } });
        patchScene(s.id, { narrationPath: r.path, narrationDuration: r.duration });
      }
      toast.success("Narration generated and synced to scenes.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setNarrBusy(false);
    }
  }

  // ---------- Improve ----------
  const scriptFn = generateScript;
  const [improving, setImproving] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  async function improve() {
    const kept = keptScenes(data);
    const transcript = kept.map((s) => s.text).filter(Boolean).join("\n");
    if (!transcript.trim()) return toast.error("There is no transcript or script to improve yet.");
    setImproving(true);
    try {
      const r = await scriptFn({ data: { mode: "improve", transcript, seconds: Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(total))), style: data.style, language: data.language, sceneCount: Math.min(15, kept.length) } });
      setData((d) => ({ ...d, improvedDraft: { title: r.title, scenes: r.scenes.map((s) => ({ text: s.text, visualPrompt: s.visualPrompt })) } }));
      setDraftOpen(true);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setImproving(false);
    }
  }
  function approveDraft() {
    const draft = dataRef.current.improvedDraft;
    if (!draft) return;
    setData((d) => {
      const kept = d.scenes.filter((s) => s.keep);
      const map = new Map(kept.map((s, i) => [s.id, draft.scenes[i]]));
      return {
        ...d,
        improvedDraft: undefined,
        scenes: d.scenes.map((s) => {
          const ds = map.get(s.id);
          if (!ds) return s;
          return project.kind === "import"
            ? { ...s, narrationText: ds.text, visualPrompt: s.visualPrompt || ds.visualPrompt, narrationPath: undefined, narrationDuration: undefined }
            : { ...s, text: ds.text, visualPrompt: ds.visualPrompt, narrationPath: undefined, narrationDuration: undefined };
        }),
      };
    });
    setDraftOpen(false);
    toast.success("Script approved. Generate narration in the Audio tab to hear it.");
  }

  // ---------- Music ----------
  const musicFn = generateMusicTrack;
  const [musicBusy, setMusicBusy] = useState(false);
  async function genMusic() {
    const prompt = data.musicPrompt?.trim() || `${data.style} background score`;
    setMusicBusy(true);
    try {
      const r = await musicFn({ data: { prompt, path: await projectPath(id, `music-${Date.now()}.mp3`) } });
      setData((d) => ({ ...d, musicPath: r.path }));
      toast.success("Music generated.");
    } catch (e) { toast.error(errMsg(e)); } finally { setMusicBusy(false); }
  }
  async function uploadMusic(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("audio/")) return toast.error("Choose an audio file.");
    try {
      const p = await uploadFile(await projectPath(id, `music-${Date.now()}-${f.name.replace(/[^\w.]/g, "_")}`), f);
      setData((d) => ({ ...d, musicPath: p }));
    } catch (e) { toast.error(errMsg(e)); }
  }

  // ---------- Preview / render ----------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [playing, setPlaying] = useState<"preview" | "render" | null>(null);
  const [prog, setProg] = useState(0);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  useEffect(() => { if (finalPath) signedUrl(finalPath).then(setFinalUrl).catch(() => undefined); }, [finalPath]);

  async function buildPlan(scenes: Scene[]): Promise<RenderPlan> {
    const d = dataRef.current;
    const src = d.sourceVideoPath ? await signedUrl(d.sourceVideoPath) : undefined;
    const plan: PlanScene[] = [];
    for (const [i, s] of scenes.entries()) {
      let videoUrl: string | undefined;
      if (s.source === "ai") {
        if (!s.clipPath) throw new Error(`Scene ${i + 1} has no AI clip yet. Generate it first.`);
        videoUrl = await signedUrl(s.clipPath);
      } else videoUrl = src;
      plan.push({ kind: s.source, videoUrl, start: s.source === "original" ? s.start ?? 0 : 0, length: sceneLength(s, d.speed), narrationUrl: s.narrationPath ? await signedUrl(s.narrationPath) : undefined, text: s.narrationText ?? s.text });
    }
    return { w: size.w, h: size.h, scenes: plan, musicUrl: d.musicPath ? await signedUrl(d.musicPath) : undefined, originalVolume: d.originalVolume, voiceVolume: d.voiceVolume, musicVolume: d.musicVolume, speed: d.speed, subtitles: d.subtitles, overlays: d.overlays };
  }

  async function run(mode: "preview" | "render", scenes = keptScenes(data)) {
    if (!scenes.length) return toast.error("No scenes to play.");
    if (mode === "render" && lengthError) return toast.error(lengthError);
    const ac = new AbortController();
    abortRef.current = ac;
    setPlaying(mode); setProg(0);
    try {
      const plan = await buildPlan(scenes);
      const blob = await renderPlan(plan, canvasRef.current!, { record: mode === "render", signal: ac.signal, onProgress: (t, tot) => setProg((t / tot) * 100) });
      if (mode === "render" && blob) {
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        const p = await uploadFile(await projectPath(id, `final-${Date.now()}.${ext}`), blob, blob.type);
        await updateProject(id, { final_video_path: p, status: "rendered", duration_seconds: +total.toFixed(1) });
        setFinalPath(p);
        qc.invalidateQueries({ queryKey: ["projects"] });
        toast.success(ext === "mp4" ? "Your MP4 is ready." : "Video rendered (your browser recorded WebM; use Chrome or Safari for MP4).");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(errMsg(e));
    } finally {
      setPlaying(null);
    }
  }

  // ---------- Timeline ops ----------
  function move(sid: string, dir: -1 | 1) {
    setData((d) => {
      const i = d.scenes.findIndex((s) => s.id === sid);
      const j = i + dir;
      if (j < 0 || j >= d.scenes.length) return d;
      const sc = [...d.scenes];
      [sc[i], sc[j]] = [sc[j], sc[i]];
      return { ...d, scenes: sc };
    });
  }
  const dragId = useRef<string | null>(null);
  function dropOn(target: string) {
    const from = dragId.current;
    if (!from || from === target) return;
    setData((d) => {
      const sc = [...d.scenes];
      const a = sc.findIndex((s) => s.id === from);
      const [it] = sc.splice(a, 1);
      sc.splice(sc.findIndex((s) => s.id === target), 0, it);
      return { ...d, scenes: sc };
    });
  }
  function addScene() {
    const s: Scene = { id: uid(), text: "", visualPrompt: "", duration: 5, source: "ai", keep: true, clipStatus: "idle" };
    setData((d) => ({ ...d, scenes: [...d.scenes, s] }));
    setSel(s.id);
  }

  const offsets = useMemo(() => {
    let t = 0;
    const m = new Map<string, number>();
    for (const s of data.scenes) if (s.keep) { m.set(s.id, t); t += sceneLength(s, data.speed); }
    return m;
  }, [data]);

  const missingClips = keptScenes(data).filter((s) => s.source === "ai" && !s.clipPath).length;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Clapperboard className="size-5 text-primary" />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => updateProject(id, { title }).catch((e) => toast.error(errMsg(e)))} className="h-10 max-w-md border-transparent bg-transparent text-xl font-semibold hover:border-input" />
        <Badge variant={lengthError ? "destructive" : "secondary"} className="timecode">{fmtTime(total)} / {MIN_SECONDS}–{MAX_SECONDS}s</Badge>
        <div className="ml-auto flex gap-2">
          {missingClips > 0 && <Button variant="secondary" onClick={genAllClips}><Film /> Generate {missingClips} clip{missingClips > 1 ? "s" : ""}</Button>}
          {playing ? (
            <Button variant="destructive" onClick={() => abortRef.current?.abort()}><Square /> Stop</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => run("preview")}><Play /> Preview</Button>
              <Button variant="hero" onClick={() => run("render")} disabled={!!lengthError}><Clapperboard /> Render MP4</Button>
            </>
          )}
        </div>
      </div>
      {lengthError && <p className="mb-4 text-sm text-destructive">{lengthError} {total > MAX_SECONDS ? "Remove or trim scenes." : "Add scenes or lengthen them."}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <div className="relative overflow-hidden rounded-xl border bg-black">
            <canvas ref={canvasRef} width={size.w} height={size.h} className={cn("mx-auto block max-h-[60vh] w-auto max-w-full", !playing && "hidden")} />
            {!playing && <ScenePreview data={data} scene={scene} aspect={size} finalUrl={finalUrl} />}
            {playing && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 text-xs">
                {playing === "render" && <span className="size-2 rounded-full bg-rec animate-rec" />}
                {playing === "render" ? "Rendering — keep this tab visible" : "Previewing"}
              </div>
            )}
          </div>
          {playing && <Progress value={prog} />}
          {finalUrl && !playing && (
            <div className="flex items-center justify-between rounded-xl border bg-card p-3 text-sm">
              <span className="flex items-center gap-2"><Check className="size-4 text-success" /> Final video rendered</span>
              <Button asChild size="sm" variant="secondary"><a href={finalUrl} download target="_blank" rel="noreferrer"><Download /> Download</a></Button>
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Timeline · drag to reorder</span><Button size="sm" variant="ghost" onClick={addScene}><Plus /> Add AI scene</Button></div>
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {data.scenes.map((s, i) => (
                <button
                  key={s.id}
                  draggable
                  onDragStart={() => (dragId.current = s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(s.id)}
                  onClick={() => setSel(s.id)}
                  style={{ width: `${Math.max(70, sceneLength(s, data.speed) * 22)}px` }}
                  className={cn("shrink-0 rounded-lg border p-2 text-left transition", s.id === sel ? "border-primary bg-primary/10" : "bg-muted hover:border-primary/40", !s.keep && "opacity-35")}
                >
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="timecode">#{i + 1} {s.keep ? fmtTime(offsets.get(s.id) ?? 0) : "cut"}</span>
                    {s.source === "ai" ? <Sparkles className={cn("size-3", s.clipPath ? "text-primary" : "")} /> : <Film className="size-3" />}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs">{(s.narrationText ?? s.text) || <em className="text-muted-foreground">no text</em>}</p>
                  <div className="mt-1 flex gap-1">
                    {s.clipStatus === "generating" && <Loader2 className="size-3 animate-spin text-primary" />}
                    {s.clipStatus === "failed" && <span className="text-[10px] text-destructive">clip failed</span>}
                    {s.narrationPath && <Mic className="size-3 text-success" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Tabs defaultValue="scene" className="min-w-0">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="scene">Scene</TabsTrigger>
            <TabsTrigger value="script">Script</TabsTrigger>
            <TabsTrigger value="audio">Audio</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
          </TabsList>

          <TabsContent value="scene" className="space-y-4 rounded-xl border bg-card p-4">
            {!scene ? <p className="text-sm text-muted-foreground">Select a scene on the timeline.</p> : (
              <>
                <div className="flex items-center justify-between">
                  <p className="font-medium">Scene {data.scenes.indexOf(scene) + 1} <span className="text-xs text-muted-foreground">· {scene.source === "ai" ? "AI clip" : "original footage"}</span></p>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => move(scene.id, -1)} aria-label="Move earlier"><ArrowUp /></Button>
                    <Button size="icon" variant="ghost" onClick={() => move(scene.id, 1)} aria-label="Move later"><ArrowDown /></Button>
                    <Button size="icon" variant="ghost" onClick={() => patchScene(scene.id, { keep: !scene.keep })} aria-label={scene.keep ? "Remove scene" : "Keep scene"}>{scene.keep ? <Eye /> : <EyeOff />}</Button>
                    <Button size="icon" variant="ghost" onClick={() => { setData((d) => ({ ...d, scenes: d.scenes.filter((s) => s.id !== scene.id) })); setSel(null); }} aria-label="Delete scene"><Trash2 /></Button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm"><span>{scene.keep ? "Kept in final video" : "Removed from final video"}</span><Switch checked={scene.keep} onCheckedChange={(v) => patchScene(scene.id, { keep: v })} /></div>
                {scene.source === "original" && scene.start != null && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Start (s)</Label><Input type="number" step="0.1" min={0} value={scene.start} onChange={(e) => patchScene(scene.id, { start: Math.max(0, Math.min(+e.target.value, (scene.end ?? 0) - 0.5)) })} className="timecode" /></div>
                    <div><Label className="text-xs">End (s)</Label><Input type="number" step="0.1" max={data.sourceDuration} value={scene.end} onChange={(e) => patchScene(scene.id, { end: Math.min(data.sourceDuration ?? 9999, Math.max(+e.target.value, (scene.start ?? 0) + 0.5)) })} className="timecode" /></div>
                  </div>
                )}
                {scene.source === "ai" && (
                  <div><Label className="text-xs">Minimum length (s)</Label><Input type="number" min={3} max={10} value={scene.duration} onChange={(e) => patchScene(scene.id, { duration: Math.max(3, Math.min(10, +e.target.value)) })} className="timecode" /></div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">{project.kind === "import" ? "Transcript (edit or clear unwanted sentences)" : "Narration"}</Label>
                  <Textarea rows={4} value={scene.text} onChange={(e) => patchScene(scene.id, { text: e.target.value, ...(scene.source === "ai" ? { narrationPath: undefined, narrationDuration: undefined } : {}) })} />
                </div>
                {scene.narrationText != null && (
                  <div className="space-y-1.5"><Label className="text-xs">New voiceover</Label><Textarea rows={3} value={scene.narrationText} onChange={(e) => patchScene(scene.id, { narrationText: e.target.value, narrationPath: undefined, narrationDuration: undefined })} /></div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Visual prompt {scene.source === "original" && "(to generate a replacement)"}</Label>
                  <Textarea rows={3} value={scene.visualPrompt} onChange={(e) => patchScene(scene.id, { visualPrompt: e.target.value })} placeholder="Slow push-in on a steaming cup of coffee at golden hour…" />
                </div>
                {scene.clipError && <p className="text-xs text-destructive">{scene.clipError}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={scene.clipStatus === "generating"} onClick={() => genClip(scene)}>
                    {scene.clipStatus === "generating" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    {scene.source === "original" ? "Generate replacement scene" : scene.clipPath ? "Regenerate clip" : "Generate clip"}
                  </Button>
                  {voiceText(scene) && <Button size="sm" variant="secondary" disabled={narrBusy} onClick={() => genNarration(scene)}><Mic /> Voice this scene</Button>}
                  <Button size="sm" variant="ghost" onClick={() => run("preview", [scene])} disabled={!!playing}><Play /> Play</Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="script" className="space-y-4 rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">AI reads the {project.kind === "import" ? "transcript" : "script"}, fixes grammar, removes repetition and sharpens the intro and conclusion. You review and approve before anything changes.</p>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Language" value={data.language} onChange={(v) => setData((d) => ({ ...d, language: v }))} items={LANGUAGES.map((l) => [l, l])} />
              <SelectField label="Style" value={data.style} onChange={(v) => setData((d) => ({ ...d, style: v }))} items={STYLES.map((l) => [l, l])} />
            </div>
            <Button variant="hero" className="w-full" onClick={improve} disabled={improving}>{improving ? <Loader2 className="animate-spin" /> : <Wand2 />} Improve My Video</Button>
            {data.improvedDraft && !draftOpen && <Button variant="secondary" className="w-full" onClick={() => setDraftOpen(true)}>Review pending script</Button>}
            <div className="space-y-2">
              {keptScenes(data).map((s, i) => (
                <div key={s.id} className="rounded-lg bg-muted p-2 text-xs"><span className="timecode text-primary">#{i + 1}</span> {s.narrationText ?? s.text}</div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="audio" className="space-y-5 rounded-xl border bg-card p-4">
            <div className="space-y-3">
              <p className="flex items-center gap-2 font-medium"><Mic className="size-4 text-primary" /> Narration</p>
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Voice" value={data.voice} onChange={(v) => setData((d) => ({ ...d, voice: v }))} items={VOICES.map((v) => [v.id, `${v.label} · ${v.gender}`])} />
                <SelectField label="Language" value={data.language} onChange={(v) => setData((d) => ({ ...d, language: v }))} items={LANGUAGES.map((l) => [l, l])} />
              </div>
              <VolumeRow label={`Speed ${data.speed.toFixed(2)}×`} value={data.speed} min={0.75} max={1.5} step={0.05} onChange={(v) => setData((d) => ({ ...d, speed: v }))} />
              <Button className="w-full" variant="secondary" onClick={() => genNarration()} disabled={narrBusy}>{narrBusy ? <Loader2 className="animate-spin" /> : <Mic />} Generate narration for all scenes</Button>
              <p className="text-xs text-muted-foreground">Each scene gets its own voice clip, and AI scenes stretch to fit their narration so voice and picture stay in sync.</p>
            </div>
            <div className="space-y-3 border-t pt-4">
              <p className="flex items-center gap-2 font-medium"><Music className="size-4 text-primary" /> Background music</p>
              <p className="text-xs text-muted-foreground">Upload a music file (free tracks: pixabay.com/music).</p>
              <div className="flex gap-2">
                <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs">Upload<input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadMusic(e.target.files?.[0])} /></label>
                {data.musicPath && <Button size="sm" variant="ghost" onClick={() => setData((d) => ({ ...d, musicPath: undefined }))}>Remove</Button>}
              </div>
              {data.musicPath && <MediaPlayer path={data.musicPath} />}
            </div>
            <div className="space-y-3 border-t pt-4">
              <p className="font-medium">Mix</p>
              {project.kind === "import" && <VolumeRow label="Original audio" value={data.originalVolume} onChange={(v) => setData((d) => ({ ...d, originalVolume: v }))} />}
              <VolumeRow label="Voice" value={data.voiceVolume} onChange={(v) => setData((d) => ({ ...d, voiceVolume: v }))} />
              <VolumeRow label="Music" value={data.musicVolume} onChange={(v) => setData((d) => ({ ...d, musicVolume: v }))} />
            </div>
          </TabsContent>

          <TabsContent value="text" className="space-y-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm"><span>Burn in subtitles</span><Switch checked={data.subtitles} onCheckedChange={(v) => setData((d) => ({ ...d, subtitles: v }))} /></div>
            <div className="flex items-center justify-between"><p className="flex items-center gap-2 font-medium"><Type className="size-4 text-primary" /> Text overlays</p>
              <Button size="sm" variant="secondary" onClick={() => setData((d) => ({ ...d, overlays: [...d.overlays, { id: uid(), text: "Your headline", start: 0, end: 3, position: "top" }] }))}><Plus /> Add</Button></div>
            {data.overlays.map((o) => <OverlayRow key={o.id} o={o} onChange={(p) => setData((d) => ({ ...d, overlays: d.overlays.map((x) => (x.id === o.id ? { ...x, ...p } : x)) }))} onDelete={() => setData((d) => ({ ...d, overlays: d.overlays.filter((x) => x.id !== o.id) }))} />)}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review improved script</DialogTitle>
            <DialogDescription>Edit anything you like. Nothing in your video changes until you approve.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {data.improvedDraft?.scenes.map((s, i) => (
              <div key={i} className="space-y-1"><Label className="timecode text-xs text-primary">Scene {i + 1}</Label>
                <Textarea rows={3} value={s.text} onChange={(e) => setData((d) => ({ ...d, improvedDraft: d.improvedDraft && { ...d.improvedDraft, scenes: d.improvedDraft.scenes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) } }))} /></div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setData((d) => ({ ...d, improvedDraft: undefined })); setDraftOpen(false); }}>Discard</Button>
            <Button variant="hero" onClick={approveDraft}><Check /> Approve script</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScenePreview({ data, scene, aspect, finalUrl }: { data: ProjectData; scene: Scene | null; aspect: { w: number; h: number }; finalUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const path = scene?.source === "ai" ? scene.clipPath : data.sourceVideoPath;
  useEffect(() => { setUrl(null); if (path) signedUrl(path).then(setUrl).catch(() => undefined); else if (finalUrl) setUrl(finalUrl); }, [path, finalUrl]);
  useEffect(() => { if (ref.current && scene?.source === "original" && scene.start != null) ref.current.currentTime = scene.start; }, [url, scene?.start, scene?.source]);
  if (!url) return <div className="grid place-items-center text-sm text-muted-foreground" style={{ aspectRatio: `${aspect.w}/${aspect.h}`, maxHeight: "60vh", margin: "0 auto" }}>{scene?.clipStatus === "generating" ? <span className="flex items-center gap-2"><Loader2 className="animate-spin" /> Generating clip…</span> : "No clip yet for this scene"}</div>;
  return <video ref={ref} src={url} controls playsInline className="mx-auto block max-h-[60vh] w-auto max-w-full" />;
}

function MediaPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { signedUrl(path).then(setUrl).catch(() => undefined); }, [path]);
  return url ? <audio src={url} controls className="w-full" /> : null;
}

function VolumeRow({ label, value, onChange, min = 0, max = 1, step = 0.05 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs"><span>{label}</span>{max === 1 && <span className="timecode text-muted-foreground">{Math.round(value * 100)}%</span>}</div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function SelectField({ label, value, onChange, items }: { label: string; value: string; onChange: (v: string) => void; items: readonly (readonly [string, string])[] }) {
  return (
    <div className="space-y-1.5"><Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{items.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
    </div>
  );
}

function OverlayRow({ o, onChange, onDelete }: { o: Overlay; onChange: (p: Partial<Overlay>) => void; onDelete: () => void }) {
  return (
    <div className="space-y-2 rounded-lg bg-muted p-3">
      <div className="flex gap-2"><Input value={o.text} onChange={(e) => onChange({ text: e.target.value })} /><Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete overlay"><Trash2 /></Button></div>
      <div className="grid grid-cols-3 gap-2">
        <Input type="number" step="0.5" min={0} value={o.start} onChange={(e) => onChange({ start: +e.target.value })} className="timecode" aria-label="Start" />
        <Input type="number" step="0.5" min={0} value={o.end} onChange={(e) => onChange({ end: +e.target.value })} className="timecode" aria-label="End" />
        <Select value={o.position} onValueChange={(v) => onChange({ position: v as Overlay["position"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="top">Top</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="bottom">Bottom</SelectItem></SelectContent></Select>
      </div>
    </div>
  );
}
