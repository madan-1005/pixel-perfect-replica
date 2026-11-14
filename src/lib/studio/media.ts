import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { defaultData, type ProjectData } from "./types";

export const BUCKET = "media";

export interface ProjectRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  data: ProjectData;
  final_video_path: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("You need to sign in.");
  return data.user.id;
}

export async function projectPath(projectId: string, name: string) {
  return `${await currentUserId()}/${projectId}/${name}`;
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(path: string) {
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(`Could not load media: ${error?.message ?? "unknown"}`);
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
export function forgetUrl(path: string) {
  urlCache.delete(path);
}

export async function uploadFile(path: string, file: Blob, contentType?: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: contentType ?? file.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  forgetUrl(path);
  return path;
}

function normalize(row: Record<string, unknown>): ProjectRow {
  return { ...(row as unknown as ProjectRow), data: defaultData((row["data"] ?? {}) as Partial<ProjectData>) };
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

export async function getProject(id: string): Promise<ProjectRow> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project not found");
  return normalize(data as Record<string, unknown>);
}

export async function createProject(title: string, kind: "text_to_video" | "import", data: ProjectData) {
  const { data: row, error } = await supabase
    .from("projects")
    .insert({ title, kind, data: data as unknown as Json })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return normalize(row as Record<string, unknown>);
}

export async function updateProject(
  id: string,
  patch: Partial<{ title: string; status: string; data: ProjectData; final_video_path: string; duration_seconds: number }>,
) {
  const { data, ...rest } = patch;
  const { error } = await supabase
    .from("projects")
    .update({ ...rest, ...(data ? { data: data as unknown as Json } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProject(id: string) {
  const uid = await currentUserId();
  const { data: files } = await supabase.storage.from(BUCKET).list(`${uid}/${id}`, { limit: 1000 });
  if (files?.length) await supabase.storage.from(BUCKET).remove(files.map((f) => `${uid}/${id}/${f.name}`));
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
