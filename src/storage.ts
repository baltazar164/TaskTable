import type { Task, TagInfo, GhConfig, SavedFilter, Tombstones, MergeLogEntry } from './types';
import { emptyTombstones, normTombstones } from './merge';

// Keys are shared with the legacy single-file app so existing data survives.
const KEYS = {
  tasks: 'ptm.tasks.v2',
  tags: 'ptm.tags.v1',
  savedFilters: 'ptm.savedFilters.v1',
  ghConfig: 'ptm.gh.config',
  ghToken: 'ptm.gh.token',
  ghAuto: 'ptm.gh.auto',
  ghLastSync: 'ptm.gh.lastsync',
  ghDirty: 'ptm.gh.dirty',
  deleted: 'ptm.deleted.v1',
  orderUpdated: 'ptm.order.updated',
  mergeLog: 'ptm.gh.mergelog',
};

/** Merge history is a local diary of this device, capped so it can't grow forever. */
const MERGE_LOG_MAX = 50;

const DEFAULT_GH_CONFIG: GhConfig = { owner: 'baltazar164', repo: 'TaskTable-data', branch: 'main', path: 'tasks.json' };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or unavailable — same silent behavior as legacy app */
  }
}

export function loadTasks(): Task[] | null {
  return readJson<Task[]>(KEYS.tasks);
}

export function saveTasks(tasks: Task[]): void {
  write(KEYS.tasks, JSON.stringify(tasks));
}

export function loadTags(): TagInfo[] | null {
  return readJson<TagInfo[]>(KEYS.tags);
}

export function saveTags(tags: TagInfo[]): void {
  write(KEYS.tags, JSON.stringify(tags));
}

export function loadSavedFilters(): SavedFilter[] | null {
  return readJson<SavedFilter[]>(KEYS.savedFilters);
}

export function saveSavedFilters(list: SavedFilter[]): void {
  write(KEYS.savedFilters, JSON.stringify(list));
}

export function loadGhConfig(): GhConfig {
  return readJson<GhConfig>(KEYS.ghConfig) || DEFAULT_GH_CONFIG;
}

export function saveGhConfig(cfg: GhConfig): void {
  write(KEYS.ghConfig, JSON.stringify(cfg));
}

export function loadGhToken(): string {
  return localStorage.getItem(KEYS.ghToken) || '';
}

export function saveGhToken(token: string): void {
  write(KEYS.ghToken, token);
}

export function clearGhToken(): void {
  try {
    localStorage.removeItem(KEYS.ghToken);
  } catch {
    /* ignore */
  }
}

export function loadAutoSync(): boolean {
  return localStorage.getItem(KEYS.ghAuto) !== '0';
}

export function saveAutoSync(on: boolean): void {
  write(KEYS.ghAuto, on ? '1' : '0');
}

export function loadLastSync(): string {
  return localStorage.getItem(KEYS.ghLastSync) || '';
}

export function saveLastSync(iso: string): void {
  write(KEYS.ghLastSync, iso);
}

export function loadTombstones(): Tombstones {
  const raw = readJson<unknown>(KEYS.deleted);
  return raw ? normTombstones(raw) : emptyTombstones();
}

export function saveTombstones(t: Tombstones): void {
  write(KEYS.deleted, JSON.stringify(t));
}

export function loadOrderUpdatedAt(): string {
  return localStorage.getItem(KEYS.orderUpdated) || '';
}

export function saveOrderUpdatedAt(iso: string): void {
  write(KEYS.orderUpdated, iso);
}

export function loadMergeLog(): MergeLogEntry[] {
  const raw = readJson<MergeLogEntry[]>(KEYS.mergeLog);
  return Array.isArray(raw) ? raw : [];
}

/** Prepend one merge to the local history and return the trimmed list. */
export function addMergeLog(entry: MergeLogEntry): MergeLogEntry[] {
  const list = [entry, ...loadMergeLog()].slice(0, MERGE_LOG_MAX);
  write(KEYS.mergeLog, JSON.stringify(list));
  return list;
}

/** True when local edits have not made it to GitHub yet (offline, failed push, …). */
export function loadDirty(): boolean {
  return localStorage.getItem(KEYS.ghDirty) === '1';
}

export function saveDirty(on: boolean): void {
  write(KEYS.ghDirty, on ? '1' : '0');
}

export function uid(): string {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
