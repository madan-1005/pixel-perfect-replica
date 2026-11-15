/** All projects and media are stored in this browser (IndexedDB) on the user's own computer. */
import { defaultData, type ProjectData } from "./types";

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

let dbp: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbp)
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("reel-studio", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("projects", { keyPath: "id" });
        r.result.createObjectStore("files");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbp;
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function currentUserId() {
  return "local";
}
export async function projectPath(projectId: string, name: string) {
  return `local/${projectId}/${name}`;
}

const urlCache = new Map<string, string>();
export async function signedUrl(path: string) {
  const c = urlCache.get(path);
  if (c) return c;
  const blob = await getFile(path);
  if (!blob) throw new Error("Media file not found on this computer.");
  const url = URL.createObjectURL(blob);
  urlCache.set(path, url);
  return url;
}
export function forgetUrl(path: string) {
  const c = urlCache.get(path);
  if (c) URL.revokeObjectURL(c);
  urlCache.delete(path);
}
export async function getFile(path: string) {
  return (await tx<Blob | undefined>("files", "readonly", (s) => s.get(path) as IDBRequest<Blob | undefined>)) ?? null;
}
export async function uploadFile(path: string, file: Blob, contentType?: string) {
  const blob = contentType && file.type !== contentType ? new Blob([file], { type: contentType }) : file;
  await tx("files", "readwrite", (s) => s.put(blob, path));
  forgetUrl(path);
  return path;
}

function normalize(row: ProjectRow): ProjectRow {
  return { ...row, data: defaultData(row.data ?? {}) };
}
export async function listProjects(): Promise<ProjectRow[]> {
  const all = await tx<ProjectRow[]>("projects", "readonly", (s) => s.getAll() as IDBRequest<ProjectRow[]>);
  return all.map(normalize).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export async function getProject(id: string): Promise<ProjectRow> {
  const r = await tx<ProjectRow | undefined>("projects", "readonly", (s) => s.get(id) as IDBRequest<ProjectRow | undefined>);
  if (!r) throw new Error("Project not found");
  return normalize(r);
}
export async function createProject(title: string, kind: "text_to_video" | "import", data: ProjectData) {
  const now = new Date().toISOString();
  const row: ProjectRow = { id: crypto.randomUUID(), title, kind, status: "draft", data, final_video_path: null, duration_seconds: null, created_at: now, updated_at: now };
  await tx("projects", "readwrite", (s) => s.put(row));
  return row;
}
export async function updateProject(
  id: string,
  patch: Partial<{ title: string; status: string; data: ProjectData; final_video_path: string; duration_seconds: number }>,
) {
  const cur = await getProject(id);
  await tx("projects", "readwrite", (s) => s.put({ ...cur, ...patch, updated_at: new Date().toISOString() }));
}
export async function deleteProject(id: string) {
  const keys = await tx<IDBValidKey[]>("files", "readonly", (s) => s.getAllKeys());
  for (const k of keys) if (String(k).startsWith(`local/${id}/`)) await tx("files", "readwrite", (s) => s.delete(k));
  await tx("projects", "readwrite", (s) => s.delete(id));
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
