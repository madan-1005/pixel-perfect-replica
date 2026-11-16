<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- TypeScript strict flags noUncheckedIndexedAccess, exactOptionalPropertyTypes and noImplicitReturns are off: the media/editor code relies on indexed arrays and optional patches, and these flags added noise without catching real bugs.
- No paid services: all AI is free/local in src/lib/studio/local-ai.ts (Ollama for scripts, Kokoro TTS and Whisper in-browser, Pexels stock clips via /api/stock-clip); the user wants zero credits or money to run the app.
- Final video compositing/rendering runs in the browser (canvas + MediaRecorder, src/lib/studio/render.ts) because the server runtime cannot run FFmpeg.
- No sign-in or cloud storage: projects and media live in browser IndexedDB (src/lib/studio/media.ts) so the app runs locally for free.
