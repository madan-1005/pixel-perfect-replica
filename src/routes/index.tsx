import { createFileRoute, Link } from "@tanstack/react-router";
import { Clapperboard, Mic, Scissors, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import hero from "@/assets/studio-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reel Studio — Create and edit videos with AI" },
      { name: "description", content: "Turn a prompt into a narrated 20–60s video, or import a clip, transcribe it and re-edit it with AI." },
      { property: "og:title", content: "Reel Studio — Create and edit videos with AI" },
      { property: "og:description", content: "Turn a prompt into a narrated video, or import a clip and re-edit it with AI." },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Wand2, t: "Text to video", d: "Prompt in, script, scenes, AI clips and narration out." },
  { icon: Upload, t: "Import & transcribe", d: "Upload a video and get a timed, editable transcript." },
  { icon: Scissors, t: "Scene editor", d: "Keep, cut, reorder and replace scenes on a timeline." },
  { icon: Mic, t: "AI voices", d: "Male and female voices in many languages, any speed." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-primary text-primary-foreground"><Clapperboard className="size-4" /></span>
          Reel Studio
        </span>
        <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
      </header>
      <section className="mx-auto max-w-6xl px-6 pt-12">
        <p className="timecode text-xs uppercase tracking-widest text-primary"><span className="mr-2 inline-block size-2 rounded-full bg-rec animate-rec" />00:00:20 — 00:01:00</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">Your next short video, directed by AI and finished by you.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">Write a prompt or bring a clip. Reel Studio writes the script, generates scenes, adds a voice, music and subtitles — then hands you the timeline.</p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg" variant="hero"><Link to="/auth">Start creating</Link></Button>
        </div>
        <img src={hero} alt="Glowing video timeline with scene frames" width={1600} height={912} className="mt-14 w-full rounded-2xl border" />
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.t} className="rounded-xl border bg-card p-5">
            <f.icon className="size-5 text-primary" />
            <h3 className="mt-3 font-medium">{f.t}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
