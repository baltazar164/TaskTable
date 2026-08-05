import type { Task, TagInfo, SavedFilter, Tombstones, SyncData } from './types';

/**
 * Merging two copies of the task list, so that neither device's work disappears.
 *
 * The rules, in short:
 *  - every task/tag/filter carries `updatedAt`; on a conflict the newer one wins whole
 *  - deletions leave a tombstone, so a deleted item can't be resurrected by the other side
 *  - the task order comes from whichever side reordered last; unknown tasks go on top
 *
 * Everything here is pure — it never touches storage, the network or React state.
 */

/** Tombstones older than this are dropped; by then every device has long since seen them. */
export const TOMBSTONE_TTL_DAYS = 90;

const DAY_MS = 86400000;

/** Missing or unparsable timestamps count as "oldest possible", so any real edit beats them. */
function ts(iso?: string): number {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

function sameList(a?: string[], b?: string[]): boolean {
  const x = a || [];
  const y = b || [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// Content equality, ignoring `updatedAt` — decides whether an edit actually happened.
export function taskEq(a: Task, b: Task): boolean {
  return a.name === b.name && a.status === b.status && (a.description || '') === (b.description || '') && sameList(a.tags, b.tags);
}
export function tagEq(a: TagInfo, b: TagInfo): boolean {
  return !!a.archived === !!b.archived;
}
export function filterEq(a: SavedFilter, b: SavedFilter): boolean {
  return a.name === b.name && (a.search || '') === (b.search || '') && sameList(a.tags, b.tags) && sameList(a.exclude, b.exclude);
}

export function emptyTombstones(): Tombstones {
  return { tasks: {}, tags: {}, filters: {} };
}

/** Read tombstones from a parsed JSON file, tolerating anything that isn't the right shape. */
export function normTombstones(raw: unknown): Tombstones {
  const src = (raw || {}) as Partial<Record<keyof Tombstones, unknown>>;
  const pick = (o: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries((o || {}) as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
    return out;
  };
  return { tasks: pick(src.tasks), tags: pick(src.tags), filters: pick(src.filters) };
}

export interface Stamped<T> {
  list: T[];
  /** Keys present before but gone now — these become tombstones. */
  deleted: Record<string, string>;
  orderChanged: boolean;
}

/**
 * Compare a list against its previous version and give new/changed entries a fresh
 * `updatedAt`. Doing it here, in one place, is why the mutation handlers don't each
 * have to remember to stamp their edits.
 */
function stamp<T extends { updatedAt?: string }>(
  prev: T[],
  next: T[],
  now: string,
  key: (x: T) => string,
  eq: (a: T, b: T) => boolean,
): Stamped<T> {
  const before = new Map(prev.map((x) => [key(x), x]));
  const list = next.map((x) => {
    const old = before.get(key(x));
    if (!old || !eq(old, x)) return { ...x, updatedAt: now };
    return x.updatedAt === old.updatedAt ? x : { ...x, updatedAt: old.updatedAt };
  });
  const alive = new Set(next.map(key));
  const deleted: Record<string, string> = {};
  for (const x of prev) if (!alive.has(key(x))) deleted[key(x)] = now;
  const orderChanged = prev.length !== next.length || prev.some((x, i) => key(x) !== key(next[i]));
  return { list, deleted, orderChanged };
}

export const stampTasks = (prev: Task[], next: Task[], now: string): Stamped<Task> => stamp(prev, next, now, (t) => t.id, taskEq);
export const stampTags = (prev: TagInfo[], next: TagInfo[], now: string): Stamped<TagInfo> => stamp(prev, next, now, (t) => t.name, tagEq);
export const stampFilters = (prev: SavedFilter[], next: SavedFilter[], now: string): Stamped<SavedFilter> =>
  stamp(prev, next, now, (f) => f.id, filterEq);

/** Union of two tombstone sets, keeping the later time and dropping expired records. */
function mergeStamps(a: Record<string, string>, b: Record<string, string>, cutoff: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of [...Object.entries(a), ...Object.entries(b)]) {
    if (ts(v) < cutoff) continue;
    if (!out[k] || ts(v) > ts(out[k])) out[k] = v;
  }
  return out;
}

/** Union by key, newest wins, minus anything a tombstone buries. */
function mergeKeyed<T extends { updatedAt?: string }>(local: T[], remote: T[], graves: Record<string, string>, key: (x: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const x of local) byKey.set(key(x), x);
  for (const x of remote) {
    const mine = byKey.get(key(x));
    // Ties stay local: equal timestamps mean the two sides agree anyway.
    if (!mine || ts(x.updatedAt) > ts(mine.updatedAt)) byKey.set(key(x), x);
  }
  const out: T[] = [];
  for (const [k, x] of byKey) {
    // An edit *after* the deletion resurrects the item; that's deliberate.
    if (graves[k] && ts(graves[k]) >= ts(x.updatedAt)) continue;
    out.push(x);
  }
  return out;
}

/** Lay tasks out in `base`'s order; anything base never saw goes on top, like a new task. */
function applyOrder(tasks: Task[], base: Task[], other: Task[]): Task[] {
  const rank = new Map(base.map((t, i) => [t.id, i]));
  const otherRank = new Map(other.map((t, i) => [t.id, i]));
  const known = tasks.filter((t) => rank.has(t.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const fresh = tasks.filter((t) => !rank.has(t.id)).sort((a, b) => (otherRank.get(a.id) ?? 0) - (otherRank.get(b.id) ?? 0));
  return [...fresh, ...known];
}

function countTaskDiff(before: Task[], after: Task[]): number {
  const was = new Map(before.map((t) => [t.id, t]));
  const now = new Set(after.map((t) => t.id));
  let n = 0;
  for (const t of after) {
    const old = was.get(t.id);
    if (!old || !taskEq(old, t)) n++;
  }
  for (const t of before) if (!now.has(t.id)) n++;
  return n;
}

/** Stable summary of everything that gets stored, used to tell "already in sync" apart. */
function fingerprint(d: SyncData): string {
  return JSON.stringify([
    d.tasks.map((t) => [t.id, t.name, t.status, t.description || '', t.tags, t.updatedAt || '']),
    d.tags.map((t) => [t.name, !!t.archived, t.updatedAt || '']),
    d.savedFilters.map((f) => [f.id, f.name, f.tags, f.exclude, f.search || '', f.updatedAt || '']),
    Object.keys(d.deleted.tasks).sort(),
    Object.keys(d.deleted.tags).sort(),
    Object.keys(d.deleted.filters).sort(),
    d.orderUpdatedAt,
  ]);
}

export interface MergeResult {
  data: SyncData;
  /** How many tasks the merge added, removed or changed on this device. */
  changedTasks: number;
  /** The merged result differs from the remote copy, so GitHub still needs it. */
  needsPush: boolean;
}

export function mergeSync(local: SyncData, remote: SyncData, nowMs: number): MergeResult {
  const cutoff = nowMs - TOMBSTONE_TTL_DAYS * DAY_MS;
  const deleted: Tombstones = {
    tasks: mergeStamps(local.deleted.tasks, remote.deleted.tasks, cutoff),
    tags: mergeStamps(local.deleted.tags, remote.deleted.tags, cutoff),
    filters: mergeStamps(local.deleted.filters, remote.deleted.filters, cutoff),
  };
  const localOrderWins = ts(local.orderUpdatedAt) >= ts(remote.orderUpdatedAt);
  const data: SyncData = {
    tasks: applyOrder(
      mergeKeyed(local.tasks, remote.tasks, deleted.tasks, (t) => t.id),
      localOrderWins ? local.tasks : remote.tasks,
      localOrderWins ? remote.tasks : local.tasks,
    ),
    tags: mergeKeyed(local.tags, remote.tags, deleted.tags, (t) => t.name),
    savedFilters: mergeKeyed(local.savedFilters, remote.savedFilters, deleted.filters, (f) => f.id),
    deleted,
    orderUpdatedAt: localOrderWins ? local.orderUpdatedAt : remote.orderUpdatedAt,
  };
  return {
    data,
    changedTasks: countTaskDiff(local.tasks, data.tasks),
    needsPush: fingerprint(data) !== fingerprint(remote),
  };
}
