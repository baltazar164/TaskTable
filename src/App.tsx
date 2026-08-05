import React from 'react';
import type {
  Task,
  TagInfo,
  SavedFilter,
  GhConfig,
  TagColor,
  RowVM,
  TagFilterRowVM,
  SavedChipVM,
  ModalTagChipVM,
  Tombstones,
  SyncData,
  MergeLogEntry,
} from './types';
import * as store from './storage';
import { normStatus, normTasks, nextStatus } from './status';
import { mergeSync, stampTasks, stampTags, stampFilters, normTombstones } from './merge';
import { apiUrl, ghHeaders, decodeContent, encodeContent, diagnose404 } from './github';
import { css } from './lib/css';
import TaskRow from './components/TaskRow';
import FilterDropdown from './components/FilterDropdown';
import SavedSearches from './components/SavedSearches';
import AddTaskModal from './components/AddTaskModal';
import TaskDetailModal from './components/TaskDetailModal';
import SyncModal from './components/SyncModal';
import ManageTags from './components/ManageTags';
import type { TagRowVM } from './components/ManageTags';

// Fixed values of the legacy Claude Design props (accent / density).
const ACCENT = '#c1762a';
const COMPACT = true;

// Built-in pseudo-tag for filtering tasks that have no tags. Never a real tag
// (real tags are always lowercased), so it can live in filterTags without collision.
const UNTAGGED = 'Untagged';

// Warm/earthy tag palette — distinguishable without any cold blue/emerald.
const PALETTE: TagColor[] = [
  { fg: '#b5622b', bg: '#f9efe4', br: '#ebd6bc' }, // rust
  { fg: '#7c8a45', bg: '#f1f2e2', br: '#dbe0bf' }, // olive
  { fg: '#b04f3e', bg: '#f9ebe7', br: '#eecabf' }, // clay-red
  { fg: '#8a5684', bg: '#f4ecf2', br: '#e2cddf' }, // plum
  { fg: '#a67c27', bg: '#f7f0dc', br: '#e8d9b0' }, // amber-brown
  { fg: '#5f7d6a', bg: '#ecf1ec', br: '#cfddd2' }, // sage
];

/** "Saved to GitHub." → "Saved to GitHub — merged 3 tasks from another device." */
function mergeNote(prefix: string, merged: number): string {
  return merged ? `${prefix} — merged ${merged} task${merged === 1 ? '' : 's'} from another device.` : prefix + '.';
}

interface AppState {
  tasks: Task[];
  tags: TagInfo[];
  search: string;
  filterTags: string[];
  excludeTags: string[];
  filterPopoverOpen: boolean;
  savedFilters: SavedFilter[];
  saveFilterOpen: boolean;
  saveFilterName: string;
  dragId: string | null;
  tagInputId: string | null;
  tagQuery: string;
  modalOpen: boolean;
  modalName: string;
  modalTags: string[];
  selectedId: string | null;
  tagsOpen: boolean;
  newTagName: string;
  syncOpen: boolean;
  ghToken: string;
  ghTokenDraft: string;
  ghConfig: GhConfig;
  ghSha: string | null;
  autoSync: boolean;
  lastSync: string;
  syncStatus: '' | 'busy' | 'ok' | 'error';
  syncMsg: string;
  /** Local edits that have not reached GitHub yet — a pull must not silently drop them. */
  dirty: boolean;
  mergeLog: MergeLogEntry[];
  narrow: boolean;
  detailOpen: boolean;
  detailId: string | null;
  detailNameDraft: string;
  detailDescDraft: string;
}

export default class App extends React.Component<Record<string, never>, AppState> {
  listRef: { current: HTMLDivElement | null } = { current: null };
  fileRef = React.createRef<HTMLInputElement>();
  private _drag: { id: string } | null = null;
  private _pushT: ReturnType<typeof setTimeout> | undefined;
  private _applyingRemote = false;
  /** Bumped on every local edit so a push only clears `dirty` if nothing changed meanwhile. */
  private _editSeq = 0;
  private _tombstones: Tombstones = store.loadTombstones();
  private _orderUpdatedAt: string = store.loadOrderUpdatedAt();
  /** Task order before the current drag, so dropping can tell whether anything moved. */
  private _dragOrder: Task[] = [];
  /** Nothing was ever stored here — the list on screen is the demo seed, not real data. */
  private _freshInstall = false;
  private _onResize: () => void;
  private _onOnline: () => void;

  constructor(props: Record<string, never>) {
    super(props);
    const loaded = store.loadTasks();
    // The demo list is stamped like a normal edit; tasks stored by an older version stay
    // unstamped on purpose, since they really are older than anything from another device.
    const seeded = new Date().toISOString();
    const tasks: Task[] = loaded
      ? normTasks(loaded)
      : [
          { id: store.uid(), name: 'Draft Q3 planning doc', tags: ['work'], status: 'doing', updatedAt: seeded },
          { id: store.uid(), name: 'Reply to landlord email', tags: ['home'], status: 'todo', updatedAt: seeded },
          { id: store.uid(), name: 'Book dentist appointment', tags: ['home', 'errand'], status: 'todo', updatedAt: seeded },
          { id: store.uid(), name: 'Review pull request #482', tags: ['work'], status: 'doing', updatedAt: seeded },
          { id: store.uid(), name: 'Renew gym membership', tags: ['errand'], status: 'done', updatedAt: seeded },
          { id: store.uid(), name: 'Plan weekend hike', tags: ['personal'], status: 'todo', updatedAt: seeded },
        ];
    const savedTags = store.loadTags();
    const tags = savedTags || [...new Set(tasks.flatMap((t) => t.tags))].map((name) => ({ name, archived: false }));
    const token = store.loadGhToken();
    this.state = {
      tasks,
      tags,
      search: '',
      filterTags: [],
      excludeTags: [],
      filterPopoverOpen: false,
      savedFilters: store.loadSavedFilters() || [],
      saveFilterOpen: false,
      saveFilterName: '',
      dragId: null,
      tagInputId: null,
      tagQuery: '',
      modalOpen: false,
      modalName: '',
      modalTags: [],
      selectedId: null,
      tagsOpen: false,
      newTagName: '',
      syncOpen: false,
      ghToken: token,
      ghTokenDraft: token,
      ghConfig: store.loadGhConfig(),
      ghSha: null,
      autoSync: store.loadAutoSync(),
      lastSync: store.loadLastSync(),
      syncStatus: '',
      syncMsg: '',
      dirty: store.loadDirty(),
      mergeLog: store.loadMergeLog(),
      narrow: typeof window !== 'undefined' && window.innerWidth < 560,
      detailOpen: false,
      detailId: null,
      detailNameDraft: '',
      detailDescDraft: '',
    };
    this._freshInstall = !loaded;
    this._onResize = () => {
      const n = window.innerWidth < 560;
      if (n !== this.state.narrow) this.setState({ narrow: n });
    };
    // Back online after a failed push? Retry it instead of waiting for the next edit.
    this._onOnline = () => {
      if (this.state.dirty && this.state.autoSync && this.state.ghToken) this.push(true);
    };
  }

  componentDidMount() {
    window.addEventListener('resize', this._onResize);
    window.addEventListener('online', this._onOnline);
    if (this.state.ghToken) this.pull();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('online', this._onOnline);
    clearTimeout(this._pushT);
  }

  /** Record what disappeared, so a merge can't bring it back from the other device. */
  private bury(kind: keyof Tombstones, gone: Record<string, string>) {
    if (!Object.keys(gone).length) return;
    this._tombstones = { ...this._tombstones, [kind]: { ...this._tombstones[kind], ...gone } };
    store.saveTombstones(this._tombstones);
  }

  /**
   * Every local write goes through save/saveTags/saveFilters, which is where edits get
   * their `updatedAt` and deletions get their tombstone. They return the stamped list —
   * callers must put *that* into state, not the array they passed in.
   */
  saveTags(tags: TagInfo[]): TagInfo[] {
    if (this._applyingRemote) {
      store.saveTags(tags);
      return tags;
    }
    const r = stampTags(this.state.tags, tags, new Date().toISOString());
    this.bury('tags', r.deleted);
    store.saveTags(r.list);
    this.scheduleAutoPush();
    return r.list;
  }

  saveFilters(list: SavedFilter[]): SavedFilter[] {
    if (this._applyingRemote) {
      store.saveSavedFilters(list);
      return list;
    }
    const r = stampFilters(this.state.savedFilters, list, new Date().toISOString());
    this.bury('filters', r.deleted);
    store.saveSavedFilters(r.list);
    this.scheduleAutoPush();
    return r.list;
  }

  /** `prev` is only passed by the drag handler, which has already put the new order in state. */
  save(tasks: Task[], prev?: Task[]): Task[] {
    if (this._applyingRemote) {
      store.saveTasks(tasks);
      return tasks;
    }
    this._freshInstall = false;
    const now = new Date().toISOString();
    const r = stampTasks(prev || this.state.tasks, tasks, now);
    this.bury('tasks', r.deleted);
    if (r.orderChanged) {
      this._orderUpdatedAt = now;
      store.saveOrderUpdatedAt(now);
    }
    store.saveTasks(r.list);
    this.scheduleAutoPush();
    return r.list;
  }

  commit(tasks: Task[], extra?: Partial<AppState>) {
    const stamped = this.save(tasks);
    this.setState(Object.assign({ tasks: stamped }, extra || {}) as Pick<AppState, 'tasks'>);
  }

  // ---- GitHub sync ----
  scheduleAutoPush() {
    if (this._applyingRemote) return;
    this._editSeq++;
    store.saveDirty(true);
    if (!this.state.dirty) this.setState({ dirty: true });
    if (!this.state.autoSync || !this.state.ghToken) return;
    clearTimeout(this._pushT);
    this._pushT = setTimeout(() => this.push(true), 1600);
  }

  openSync = () => this.setState({ syncOpen: true, ghTokenDraft: this.state.ghToken, syncMsg: '', syncStatus: '' });
  closeSync = () => this.setState({ syncOpen: false });
  onTokenInput = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ ghTokenDraft: e.target.value });
  onConfigField = (e: React.ChangeEvent<HTMLInputElement>) => {
    const k = e.currentTarget.dataset.k as keyof GhConfig;
    const cfg = { ...this.state.ghConfig, [k]: e.currentTarget.value.trim() };
    store.saveGhConfig(cfg);
    this.setState({ ghConfig: cfg });
  };
  toggleAuto = () => {
    const v = !this.state.autoSync;
    store.saveAutoSync(v);
    this.setState({ autoSync: v });
  };
  connectGh = () => {
    const t = (this.state.ghTokenDraft || '').trim();
    store.saveGhToken(t);
    this.setState({ ghToken: t }, () => {
      if (t) this.pull();
    });
  };
  disconnectGh = () => {
    store.clearGhToken();
    this.setState({ ghToken: '', ghTokenDraft: '', ghSha: null, syncStatus: '', syncMsg: 'Disconnected from GitHub.' });
  };

  /** `force` replaces local data with the GitHub copy even if local edits are still unpushed. */
  discardLocalAndPull = () => {
    if (!window.confirm('Replace this device’s tasks with the copy on GitHub? Local changes that were never pushed will be lost.')) return;
    this.pull(true);
  };

  async pull(force?: boolean) {
    if (!this.state.ghToken) {
      this.setState({ syncStatus: 'error', syncMsg: 'Add a token and press Connect first.' });
      return;
    }
    this.setState({ syncStatus: 'busy', syncMsg: 'Pulling from GitHub…' });
    try {
      const c = this.state.ghConfig;
      const headers = ghHeaders(this.state.ghToken);
      const res = await fetch(`${apiUrl(c)}?ref=${encodeURIComponent(c.branch)}&t=${Date.now()}`, { headers, cache: 'no-store' });
      if (res.status === 401) throw new Error('token rejected (401). Regenerate the token and reconnect.');
      if (res.status === 404) {
        const repo = await fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, { headers, cache: 'no-store' });
        if (repo.ok) {
          this.setState({ syncStatus: 'ok', syncMsg: 'Connected. No backup file yet — press “Push now” to create it.', ghSha: null });
          return;
        }
        throw new Error(await diagnose404(c, this.state.ghToken));
      }
      if (!res.ok) throw new Error('GitHub returned ' + res.status);
      const j = await res.json();
      const remote = this.parseRemote(j.content);
      // A brand-new install shows demo tasks that were never real. Merging them would
      // push the demo list onto every other device, so the first pull just takes GitHub's.
      if (force || (this._freshInstall && !this.state.dirty)) {
        const wasFresh = this._freshInstall;
        this._freshInstall = false;
        this.applySync(remote, j.sha, false, 0);
        this.setState({ syncStatus: 'ok', syncMsg: wasFresh ? 'Loaded your tasks from GitHub.' : 'Replaced this device’s data with the GitHub copy.' });
        return;
      }
      const m = mergeSync(this.localSyncData(), remote, Date.now());
      this.applySync(m.data, j.sha, m.needsPush, m.changedTasks);
      this.setState({ syncStatus: 'ok', syncMsg: mergeNote('Pulled from GitHub', m.changedTasks) + (m.needsPush ? ' Sending this device’s side back…' : '') });
      if (m.needsPush && this.state.autoSync) this.push(true);
    } catch (err) {
      this._applyingRemote = false;
      this.setState({ syncStatus: 'error', syncMsg: 'Pull failed: ' + (err as Error).message });
    }
  }

  private localSyncData(): SyncData {
    return {
      tasks: this.state.tasks,
      tags: this.state.tags,
      savedFilters: this.state.savedFilters,
      deleted: this._tombstones,
      orderUpdatedAt: this._orderUpdatedAt,
    };
  }

  /** Decode a GitHub contents payload into mergeable data. Files from v2 simply lack timestamps. */
  private parseRemote(content: string): SyncData {
    const raw = JSON.parse(decodeContent(content || '')) as {
      tasks?: unknown;
      tags?: unknown;
      savedFilters?: unknown;
      deleted?: unknown;
      orderUpdatedAt?: unknown;
    };
    const tasks = normTasks(raw.tasks);
    return {
      tasks,
      tags: Array.isArray(raw.tags)
        ? (raw.tags as TagInfo[])
        : [...new Set(tasks.flatMap((t) => t.tags || []))].map((name) => ({ name, archived: false })),
      savedFilters: Array.isArray(raw.savedFilters) ? (raw.savedFilters as SavedFilter[]) : [],
      deleted: normTombstones(raw.deleted),
      orderUpdatedAt: typeof raw.orderUpdatedAt === 'string' ? raw.orderUpdatedAt : '',
    };
  }

  /** Write merged data everywhere at once, without it counting as a local edit. */
  private applySync(data: SyncData, sha: string | null, dirty: boolean, changedTasks: number) {
    this._applyingRemote = true;
    store.saveTasks(data.tasks);
    store.saveTags(data.tags);
    store.saveSavedFilters(data.savedFilters);
    store.saveTombstones(data.deleted);
    store.saveOrderUpdatedAt(data.orderUpdatedAt);
    this._tombstones = data.deleted;
    this._orderUpdatedAt = data.orderUpdatedAt;
    const now = new Date().toISOString();
    store.saveLastSync(now);
    store.saveDirty(dirty);
    const mergeLog = changedTasks > 0 ? store.addMergeLog({ at: now, tasks: changedTasks }) : this.state.mergeLog;
    const alive = new Set(data.tasks.map((t) => t.id));
    this.setState({
      tasks: data.tasks,
      tags: data.tags,
      savedFilters: data.savedFilters,
      ghSha: sha,
      lastSync: now,
      dirty,
      mergeLog,
      selectedId: this.state.selectedId && alive.has(this.state.selectedId) ? this.state.selectedId : null,
      tagInputId: this.state.tagInputId && alive.has(this.state.tagInputId) ? this.state.tagInputId : null,
    });
    this._applyingRemote = false;
  }

  async push(silent?: boolean) {
    if (!this.state.ghToken) {
      if (!silent) this.setState({ syncStatus: 'error', syncMsg: 'Add a token and press Connect first.' });
      return;
    }
    this.setState({ syncStatus: 'busy', syncMsg: silent ? 'Auto-syncing…' : 'Pushing to GitHub…' });
    const seq = this._editSeq;
    try {
      const c = this.state.ghConfig;
      const headers = ghHeaders(this.state.ghToken);
      let sha = this.state.ghSha;
      let remote: SyncData | null = null;
      try {
        const head = await fetch(`${apiUrl(c)}?ref=${encodeURIComponent(c.branch)}&t=${Date.now()}`, { headers, cache: 'no-store' });
        if (head.ok) {
          const hj = await head.json();
          sha = hj.sha;
          remote = this.parseRemote(hj.content);
        } else if (head.status === 404) sha = null;
      } catch {
        /* keep previous sha */
      }
      // Merge before writing: sending raw local data would erase whatever another
      // device put on GitHub since this one last synced.
      let outgoing = this.localSyncData();
      let merged = 0;
      let upToDate = false;
      if (remote) {
        const m = mergeSync(outgoing, remote, Date.now());
        outgoing = m.data;
        merged = m.changedTasks;
        upToDate = !m.needsPush;
        // Adopt the merge locally right away — still dirty until the write lands.
        this.applySync(outgoing, sha, true, merged);
      }
      let newSha = sha;
      if (!upToDate) {
        const data = {
          version: 3,
          exportedAt: new Date().toISOString(),
          tasks: outgoing.tasks,
          tags: outgoing.tags,
          savedFilters: outgoing.savedFilters,
          deleted: outgoing.deleted,
          orderUpdatedAt: outgoing.orderUpdatedAt,
        };
        const body: { message: string; content: string; branch: string; sha?: string } = {
          message: `Update tasks — ${new Date().toLocaleString()}`,
          content: encodeContent(data),
          branch: c.branch,
        };
        if (sha) body.sha = sha;
        const res = await fetch(apiUrl(c), { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.status === 401) throw new Error('token rejected (401). Regenerate the token and reconnect.');
        if (res.status === 404) throw new Error(await diagnose404(c, this.state.ghToken));
        if (res.status === 403) {
          let m = '';
          try {
            m = (await res.json()).message || '';
          } catch {
            /* no body */
          }
          throw new Error(
            'token can see the repo but can’t write to it. Fix: on the token at github.com/settings/tokens, set Permissions → Contents = Read and write (not Read-only), Update, then press “Update token” here.' +
              (m ? ' [GitHub: ' + m + ']' : ''),
          );
        }
        if (res.status === 422) throw new Error('branch “' + c.branch + '” may not exist in the repo. Check the Branch field (new empty repos have none yet).');
        if (!res.ok) throw new Error('GitHub returned ' + res.status);
        const j = await res.json();
        newSha = (j.content && j.content.sha) || null;
      }
      const now = new Date().toISOString();
      store.saveLastSync(now);
      // Edits made while this request was in flight are still unpushed.
      const settled = this._editSeq === seq;
      if (settled) store.saveDirty(false);
      this.setState({
        ghSha: newSha,
        syncStatus: 'ok',
        syncMsg: mergeNote(upToDate ? 'GitHub already had everything' : 'Saved to GitHub', merged),
        lastSync: now,
        dirty: !settled,
      });
    } catch (err) {
      this.setState({
        syncStatus: 'error',
        syncMsg: 'Push failed: ' + (err as Error).message + ' Your changes are still here and will be kept until a push succeeds.',
      });
    }
  }

  tagColor(name: string): TagColor {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  rowOf(e: { target: EventTarget | null }): string | null {
    const el = (e.target as HTMLElement | null)?.closest?.('[data-id]') as HTMLElement | null;
    return el ? (el.dataset.id ?? null) : null;
  }

  // ---- basic mutations ----
  onSearch = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ search: e.target.value });
  clearSearch = () => this.setState({ search: '' });
  // Tri-state cycle for a tag: none -> "show only" -> "hide" -> none.
  cycleFilterTag(name: string) {
    this.setState((s) => {
      const isInc = s.filterTags.includes(name);
      const isExc = s.excludeTags.includes(name);
      let inc = s.filterTags.filter((x) => x !== name);
      let exc = s.excludeTags.filter((x) => x !== name);
      if (!isInc && !isExc) inc = [...inc, name]; // none -> show only
      else if (isInc) exc = [...exc, name]; // show only -> hide
      // hide -> none (already removed)
      return { filterTags: inc, excludeTags: exc };
    });
  }
  onToggleFilterChip = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    this.cycleFilterTag(e.currentTarget.dataset.tag || '');
  };
  clearFilters = () => this.setState({ filterTags: [], excludeTags: [] });
  toggleFilterPopover = () => this.setState((s) => ({ filterPopoverOpen: !s.filterPopoverOpen }));
  closeFilterPopover = () => this.setState({ filterPopoverOpen: false });

  // ---- saved searches ----
  openSaveFilter = () => {
    const suggestion = this.state.filterTags.map((t) => t[0].toUpperCase() + t.slice(1)).join(' + ');
    this.setState({ saveFilterOpen: true, saveFilterName: suggestion });
  };
  cancelSaveFilter = () => this.setState({ saveFilterOpen: false, saveFilterName: '' });
  onSaveFilterNameInput = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ saveFilterName: e.target.value });
  onSaveFilterKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.confirmSaveFilter();
    } else if (e.key === 'Escape') {
      this.cancelSaveFilter();
    }
  };
  confirmSaveFilter = () => {
    const name = this.state.saveFilterName.trim();
    if (!name) return;
    const entry: SavedFilter = { id: store.uid(), name, tags: [...this.state.filterTags], exclude: [...this.state.excludeTags], search: this.state.search };
    const list = this.saveFilters([...this.state.savedFilters, entry]);
    this.setState({ savedFilters: list, saveFilterOpen: false, saveFilterName: '' });
  };
  onApplySavedFilter = (e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    const entry = this.state.savedFilters.find((f) => f.id === id);
    if (!entry) return;
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    const active =
      sameSet(entry.tags || [], this.state.filterTags) &&
      sameSet(entry.exclude || [], this.state.excludeTags) &&
      (entry.search || '') === this.state.search;
    if (active) {
      this.setState({ filterTags: [], excludeTags: [], search: '', filterPopoverOpen: false });
      return;
    }
    this.setState({ filterTags: [...entry.tags], excludeTags: [...(entry.exclude || [])], search: entry.search || '', filterPopoverOpen: false });
  };
  onDeleteSavedFilter = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    const list = this.saveFilters(this.state.savedFilters.filter((f) => f.id !== id));
    this.setState({ savedFilters: list });
  };

  // Checkbox click cycles the status forward: To do → Doing → Done → To do.
  onToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = this.rowOf(e);
    this.commit(this.state.tasks.map((t) => (t.id === id ? { ...t, status: nextStatus(normStatus(t)) } : t)));
  };
  onRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const id = this.rowOf(e);
    if (!id) return;
    this.setState((s) => ({ selectedId: s.selectedId === id ? null : id }));
  };
  clearDone = () => this.commit(this.state.tasks.filter((t) => normStatus(t) !== 'done'));

  // ---- add-task modal ----
  // A new task inherits the selected row's tags by default (the user can toggle
  // any off/on before submitting); nothing selected opens with no tags chosen.
  openModal = () => {
    const sel = this.state.tasks.find((t) => t.id === this.state.selectedId);
    this.setState({ modalOpen: true, modalName: '', modalTags: sel ? [...sel.tags] : [] });
  };
  closeModal = () => this.setState({ modalOpen: false });
  stop = (e: React.SyntheticEvent) => e.stopPropagation();
  onModalInput = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ modalName: e.target.value });
  toggleModalTag = (e: React.MouseEvent<HTMLButtonElement>) => {
    const name = e.currentTarget.dataset.tag || '';
    this.setState((s) => ({
      modalTags: s.modalTags.includes(name) ? s.modalTags.filter((x) => x !== name) : [...s.modalTags, name],
    }));
  };
  submitModal = () => {
    const v = this.state.modalName.trim();
    if (!v) return;
    const nt: Task = { id: store.uid(), name: v, tags: [...this.state.modalTags], status: 'todo' };
    const arr = [...this.state.tasks];
    const idx = this.state.selectedId ? arr.findIndex((t) => t.id === this.state.selectedId) : -1;
    if (idx >= 0) arr.splice(idx + 1, 0, nt);
    else arr.unshift(nt);
    this.commit(arr, { modalOpen: false, modalName: '', modalTags: [], selectedId: nt.id });
  };
  onModalKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.submitModal();
    } else if (e.key === 'Escape') {
      this.closeModal();
    }
  };

  // ---- task detail modal ----
  onOpenDetail = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = this.rowOf(e);
    const t = this.state.tasks.find((t) => t.id === id);
    if (!t) return;
    this.setState({ detailOpen: true, detailId: id, detailNameDraft: t.name, detailDescDraft: t.description || '' });
  };
  closeDetail = () => this.setState({ detailOpen: false, detailId: null });
  onDetailKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') this.closeDetail();
  };
  onDetailNameInput = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ detailNameDraft: e.target.value });
  onDetailDescInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => this.setState({ detailDescDraft: e.target.value });
  saveDetail = () => {
    const id = this.state.detailId;
    const name = this.state.detailNameDraft.trim();
    if (!name) return;
    this.commit(
      this.state.tasks.map((t) => (t.id === id ? { ...t, name, description: this.state.detailDescDraft } : t)),
      { detailOpen: false, detailId: null },
    );
  };

  onNameKey = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    } else if (e.key === 'Escape') {
      (e.target as HTMLElement).blur();
    }
  };
  onNameBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    const id = this.rowOf(e);
    const v = (e.target.textContent || '').trim();
    if (!v) this.commit(this.state.tasks.filter((t) => t.id !== id));
    else this.commit(this.state.tasks.map((t) => (t.id === id ? { ...t, name: v } : t)));
  };

  // ---- add tags to a task (picker popover) ----
  onAddTagClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = this.rowOf(e);
    this.setState({ tagInputId: id, tagQuery: '' });
  };
  closeTagPopover = () => this.setState({ tagInputId: null, tagQuery: '' });
  onTagQueryInput = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ tagQuery: e.target.value });
  addTagToTask(id: string | null, name: string) {
    name = (name || '').trim().toLowerCase();
    if (!name) return;
    let reg = this.state.tags;
    if (!reg.some((t) => t.name === name)) {
      reg = this.saveTags([...reg, { name, archived: false }]);
    }
    const tasks = this.save(this.state.tasks.map((t) => (t.id === id && !t.tags.includes(name) ? { ...t, tags: [...t.tags, name] } : t)));
    this.setState({ tasks, tags: reg, tagQuery: '' });
  }
  onTagInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const id = this.rowOf(e);
      this.addTagToTask(id, this.state.tagQuery);
    } else if (e.key === 'Escape') {
      this.closeTagPopover();
    }
  };
  onPickSuggestion = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = this.rowOf(e);
    this.addTagToTask(id, e.currentTarget.dataset.tag || '');
  };
  onCreateTag = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = this.rowOf(e);
    this.addTagToTask(id, this.state.tagQuery);
  };
  onRemoveTag = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const id = this.rowOf(e);
    const tag = e.currentTarget.dataset.tag;
    this.commit(this.state.tasks.map((t) => (t.id === id ? { ...t, tags: t.tags.filter((x) => x !== tag) } : t)));
  };

  // ---- backup: export / import ----
  exportData = () => {
    // Same shape as the file on GitHub, tombstones included — a backup that dropped them
    // would resurrect deleted tasks the first time it was imported and merged.
    const local = this.localSyncData();
    const data = { version: 3, exportedAt: new Date().toISOString(), ...local };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  onImportClick = () => {
    if (this.fileRef.current) this.fileRef.current.click();
  };
  onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const tasks: Task[] = normTasks(data.tasks);
        if (!tasks.length && !window.confirm('This backup has no tasks. Import anyway?')) return;
        if (!window.confirm(`Replace your current list with this backup (${tasks.length} task${tasks.length === 1 ? '' : 's'})? This cannot be undone.`)) return;
        const tags: TagInfo[] = Array.isArray(data.tags)
          ? data.tags
          : [...new Set(tasks.flatMap((t) => t.tags || []))].map((name) => ({ name, archived: false }));
        const savedFilters: SavedFilter[] = Array.isArray(data.savedFilters) ? data.savedFilters : this.state.savedFilters;
        // An import replaces the list, so it goes through the normal save path: changed
        // entries get a fresh timestamp and everything it drops gets a tombstone. That's
        // what makes the replacement survive the next merge instead of being undone by it.
        // Deletions recorded in the backup are kept too, so they stay dead.
        const fromFile = normTombstones(data.deleted);
        this.bury('tasks', fromFile.tasks);
        this.bury('tags', fromFile.tags);
        this.bury('filters', fromFile.filters);
        this.setState({
          tasks: this.save(tasks),
          tags: this.saveTags(tags),
          savedFilters: this.saveFilters(savedFilters),
          selectedId: null,
          tagInputId: null,
          tagsOpen: false,
        });
      } catch {
        window.alert("Could not read that file — make sure it's a backup exported from this app.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ---- manage-tags page ----
  openTags = () => this.setState({ tagsOpen: true, newTagName: '' });
  closeTags = () => this.setState({ tagsOpen: false });
  onNewTagInput = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ newTagName: e.target.value });
  addTag = () => {
    const v = this.state.newTagName.trim().toLowerCase();
    if (!v) return;
    if (this.state.tags.some((t) => t.name === v)) {
      this.setState({ newTagName: '' });
      return;
    }
    this.setState({ tags: this.saveTags([...this.state.tags, { name: v, archived: false }]), newTagName: '' });
  };
  onNewTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.addTag();
    }
  };
  toggleArchive = (e: React.MouseEvent<HTMLButtonElement>) => {
    const name = e.currentTarget.dataset.tag;
    this.setState({ tags: this.saveTags(this.state.tags.map((t) => (t.name === name ? { ...t, archived: !t.archived } : t))) });
  };
  deleteTag = (e: React.MouseEvent<HTMLButtonElement>) => {
    const name = e.currentTarget.dataset.tag;
    const tags = this.saveTags(this.state.tags.filter((t) => t.name !== name));
    const tasks = this.save(this.state.tasks.map((t) => ({ ...t, tags: t.tags.filter((x) => x !== name) })));
    this.setState({ tags, tasks });
  };

  // ---- drag reorder (pointer, works on touch + mouse) ----
  setListEl = (el: HTMLDivElement | null) => {
    this.listRef.current = el;
    if (el && !(el as HTMLDivElement & { _dragBound?: boolean })._dragBound) {
      (el as HTMLDivElement & { _dragBound?: boolean })._dragBound = true;
      el.addEventListener('pointerdown', this.onGripDown);
    }
  };
  onGripDown = (e: PointerEvent) => {
    const grip = (e.target as HTMLElement | null)?.closest?.('[data-grip]');
    if (!grip) return;
    const id = this.rowOf(e);
    if (!id) return;
    e.preventDefault();
    this._drag = { id };
    // reorder() only touches state; the drop compares against this to see if anything moved.
    this._dragOrder = this.state.tasks;
    this.setState({ dragId: id });
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', this.onGripMove);
    window.addEventListener('pointerup', this.onGripUp);
  };
  onGripMove = (e: PointerEvent) => {
    const d = this._drag;
    const list = this.listRef.current;
    if (!d || !list) return;
    const els = [...list.querySelectorAll<HTMLElement>('[data-task-row]')];
    const y = e.clientY;
    let beforeId: string | null = null;
    for (const el of els) {
      if (el.dataset.id === d.id) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        beforeId = el.dataset.id ?? null;
        break;
      }
    }
    this.reorder(d.id, beforeId);
  };
  onGripUp = () => {
    this._drag = null;
    this.setState({ tasks: this.save(this.state.tasks, this._dragOrder), dragId: null });
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('pointermove', this.onGripMove);
    window.removeEventListener('pointerup', this.onGripUp);
  };
  reorder(id: string, beforeId: string | null) {
    if (id === beforeId) return;
    const cur = this.state.tasks;
    const arr = [...cur];
    const from = arr.findIndex((t) => t.id === id);
    if (from < 0) return;
    const [it] = arr.splice(from, 1);
    let to = beforeId == null ? arr.length : arr.findIndex((t) => t.id === beforeId);
    if (to < 0) to = arr.length;
    arr.splice(to, 0, it);
    if (arr.every((t, i) => t.id === cur[i].id)) return;
    this.setState({ tasks: arr });
  }

  render() {
    const accent = ACCENT;
    const compact = COMPACT;
    const pad = compact ? '5px 14px' : '9px 14px';
    const nameFont = compact ? "500 13px 'Public Sans',sans-serif" : "500 14px 'Public Sans',sans-serif";

    const q = this.state.search.trim().toLowerCase();
    let visible = this.state.tasks;
    if (q) visible = visible.filter((t) => t.name.toLowerCase().includes(q) || t.tags.some((tg) => tg.includes(q)));

    const activeFilterTags = this.state.filterTags;
    const excludeTags = this.state.excludeTags;
    const untaggedFilterActive = activeFilterTags.includes(UNTAGGED);
    const realFilterTags = activeFilterTags.filter((x) => x !== UNTAGGED);
    if (activeFilterTags.length) {
      // Real tag filters AND-combine; the "Untagged" pseudo-tag OR-combines with them:
      // a task shows if it matches every selected real tag, or (Untagged active) it has no tags.
      visible = visible.filter((t) => {
        const matchesReal = realFilterTags.length > 0 && realFilterTags.every((tag) => t.tags.includes(tag));
        const matchesUntagged = untaggedFilterActive && t.tags.length === 0;
        return matchesReal || matchesUntagged;
      });
    }
    // Exclude ("hide") removes any task carrying an excluded tag; the "Untagged"
    // pseudo-tag hides tasks that have no tags at all.
    if (excludeTags.length) {
      visible = visible.filter(
        (t) => !excludeTags.some((tag) => (tag === UNTAGGED ? t.tags.length === 0 : t.tags.includes(tag))),
      );
    }

    const reg = this.state.tags;
    const tq = (this.state.tagQuery || '').trim().toLowerCase();

    const narrow = this.state.narrow;
    // Pie-square checkbox fills communicate status: To do = empty outline,
    // Doing = diagonal half-fill, Done = solid fill. Colors follow the warm scheme.
    const CK: Record<Task['status'], string> = { todo: '#cdc7bc', doing: accent, done: '#7d8b4a' };
    const LBL: Record<Task['status'], { label: string; next: string }> = {
      todo: { label: 'To do', next: 'Doing' },
      doing: { label: 'Doing', next: 'Done' },
      done: { label: 'Done', next: 'To do' },
    };
    const checkStyleFor = (st: Task['status']) => {
      const col = CK[st];
      const bg = st === 'doing' ? `linear-gradient(135deg, ${col} 0 50%, #fff 50% 100%)` : st === 'done' ? col : '#fff';
      return (
        `width:17px;height:17px;border:1.6px solid ${col};border-radius:5px;background:${bg};` +
        `cursor:pointer;padding:0;transition:all .12s;box-sizing:border-box;display:grid;place-items:center;line-height:1` +
        (narrow ? ';grid-column:4;grid-row:2;justify-self:center' : '')
      );
    };
    const rows: RowVM[] = visible.map((t) => {
      const dragging = t.id === this.state.dragId;
      const selected = t.id === this.state.selectedId;
      const open = t.id === this.state.tagInputId;
      const avail = open ? reg.filter((g) => !g.archived && !t.tags.includes(g.name) && (!tq || g.name.includes(tq))) : [];
      const canCreate = open && tq.length > 0 && !reg.some((g) => g.name === tq);
      const hasDesc = (t.description || '').replace(/\s+/g, ' ').trim().length > 0;
      const st = normStatus(t);
      return {
        id: t.id,
        name: t.name,
        status: st,
        checkTitle: `${LBL[st].label} — click to mark ${LBL[st].next}`,
        hasDesc,
        detailTitle: hasDesc ? 'Open task — has description' : 'Open task',
        showTagInput: open,
        showAddBtn: !open,
        suggestions: avail.map((g) => {
          const c = this.tagColor(g.name);
          return { name: g.name, dot: `width:9px;height:9px;border-radius:50%;flex:none;background:${c.fg}` };
        }),
        showCreate: canCreate,
        createLabel: tq,
        emptySuggest: open && avail.length === 0 && !canCreate,
        rowStyle:
          `display:grid;grid-template-columns:${narrow ? 'minmax(0,1fr) 22px 22px 24px' : '24px 22px 22px minmax(0,1fr) auto'};align-items:center;gap:${narrow ? '4px 12px' : '9px'};padding:${pad};cursor:pointer;` +
          `border-bottom:1px solid #f1eee8;position:relative;background:${dragging ? '#fff' : selected ? accent + '14' : 'transparent'};` +
          `box-shadow:${dragging ? '0 10px 26px rgba(31,29,27,.18)' : selected ? 'inset 3px 0 0 ' + accent : 'none'};border-radius:${dragging ? '9px' : '0'};` +
          `z-index:${dragging ? '5' : 'auto'};transition:box-shadow .12s ease,background .12s ease,border-radius .12s ease`,
        gripStyle:
          `display:inline-flex;align-items:center;justify-content:center;cursor:grab;color:#cbc6bb;touch-action:none;padding:5px 3px;border-radius:5px;margin:-5px 0` +
          (narrow ? ';grid-column:4;grid-row:1;justify-self:center' : ''),
        tagWrapStyle: narrow
          ? 'display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-start;grid-column:1 / 3;grid-row:2;padding-top:2px'
          : 'display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:flex-end',
        checkStyle: checkStyleFor(st),
        detailStyle:
          `display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1.6px solid ${hasDesc ? accent : '#d8d3c8'};border-radius:5px;background:${hasDesc ? accent + '12' : '#fff'};color:${hasDesc ? accent : '#948d80'};cursor:pointer;padding:0;line-height:1;transition:all .12s` +
          (narrow ? ';grid-column:3;grid-row:2;justify-self:center' : ''),
        nameStyle:
          `font:${nameFont};padding:2px 4px;margin:-2px 0;border-radius:5px;min-width:30px;cursor:text;` +
          (st === 'done' ? 'text-decoration:line-through;color:#aca699' : 'color:#22201d') +
          (narrow ? ';grid-column:1 / 4;grid-row:1' : ''),
        tagPills: t.tags.map((name) => {
          const c = this.tagColor(name);
          return {
            name,
            style: `display:inline-flex;align-items:center;gap:2px;padding:2px 8px;border-radius:20px;font:600 10.5px 'JetBrains Mono',monospace;color:${c.fg};background:${c.bg};border:1px solid ${c.br}`,
          };
        }),
      };
    });

    const counts = (name: string) => this.state.tasks.filter((t) => t.tags.includes(name)).length;
    const tagRow = (g: TagInfo): TagRowVM => {
      const c = this.tagColor(g.name);
      const n = counts(g.name);
      return { name: g.name, dot: `width:11px;height:11px;border-radius:50%;flex:none;background:${c.fg}`, countLabel: `${n} task${n === 1 ? '' : 's'}` };
    };
    const activeTags = reg.filter((g) => !g.archived).map(tagRow);
    const archivedTags = reg.filter((g) => g.archived).map(tagRow);

    // Tri-state box shared style: `incColor` is the tag's own include tint (grey for
    // Untagged), `excColor` the shared "hide" red.
    const triBox = (incColor: string, active: boolean, excluded: boolean) => {
      const col = active ? incColor : excluded ? '#c0563f' : null;
      return `width:16px;height:16px;border-radius:4px;flex:none;display:grid;place-items:center;border:1.6px solid ${col || '#d8d3c8'};background:${col || '#fff'};color:#fff;font:700 12px 'Public Sans',sans-serif;line-height:0;transition:all .12s`;
    };
    const triGlyph = (active: boolean, excluded: boolean) => (active ? '✓' : excluded ? '−' : '');
    const triName = (excluded: boolean) =>
      `flex:1;min-width:0;${excluded ? 'text-decoration:line-through;text-decoration-color:#c98b7e;color:#b3ada2' : ''}`;
    const triTitle = (active: boolean, excluded: boolean) =>
      active ? 'Showing only this tag — click to hide' : excluded ? 'Hidden — click to clear' : 'Click to show only this tag';

    const filterableTags = reg.filter((g) => !g.archived && counts(g.name) > 0);
    const filterChecks: TagFilterRowVM[] = filterableTags.map((g) => {
      const c = this.tagColor(g.name);
      const active = activeFilterTags.includes(g.name);
      const excluded = excludeTags.includes(g.name);
      return {
        name: g.name,
        count: counts(g.name),
        active,
        excluded,
        boxStyle: triBox(c.fg, active, excluded),
        glyph: triGlyph(active, excluded),
        dotStyle: `width:8px;height:8px;border-radius:50%;flex:none;background:${c.fg}`,
        nameStyle: triName(excluded),
        title: triTitle(active, excluded),
      };
    });
    // "Untagged" pseudo-tag: prepended as the first filter option, shown only when
    // some task has no tags. Deliberately styled apart from real tags (neutral grey
    // include color, hollow dashed dot).
    const untaggedExcluded = excludeTags.includes(UNTAGGED);
    const untaggedCount = this.state.tasks.filter((t) => t.tags.length === 0).length;
    if (untaggedCount > 0) {
      filterChecks.unshift({
        name: UNTAGGED,
        count: untaggedCount,
        active: untaggedFilterActive,
        excluded: untaggedExcluded,
        boxStyle: triBox('#6b655b', untaggedFilterActive, untaggedExcluded),
        glyph: triGlyph(untaggedFilterActive, untaggedExcluded),
        dotStyle: 'width:8px;height:8px;border-radius:50%;flex:none;border:1.4px dashed #b3ada2;background:transparent',
        nameStyle: triName(untaggedExcluded),
        title: triTitle(untaggedFilterActive, untaggedExcluded),
      });
    }
    const filterCount = activeFilterTags.length + excludeTags.length;
    const filterBtnStyle = `display:inline-flex;align-items:center;gap:7px;padding:8px 14px;background:${filterCount ? accent + '14' : '#fff'};border:1px solid ${filterCount ? accent : '#e6e2da'};border-radius:10px;font:600 12.5px 'Public Sans',sans-serif;color:${filterCount ? accent : '#4a453d'};cursor:pointer;box-shadow:0 1px 2px rgba(31,29,27,.03)`;
    const filterBadgeStyle = `display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:20px;background:${accent};color:#fff;font:700 10px 'JetBrains Mono',monospace`;

    // Saved searches: a chip is "active" when its tag set (order-independent) and search string match the current filter.
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    const canSave = activeFilterTags.length > 0 || excludeTags.length > 0 || q.length > 0;
    const savedChips: SavedChipVM[] = this.state.savedFilters.map((sf) => {
      const active =
        sameSet(sf.tags || [], activeFilterTags) && sameSet(sf.exclude || [], excludeTags) && (sf.search || '') === this.state.search;
      return {
        id: sf.id,
        name: sf.name,
        active,
        wrapStyle:
          `display:inline-flex;align-items:center;border-radius:20px;white-space:nowrap;` +
          (active ? `background:${accent};color:#fff;border:1px solid ${accent}` : `background:#fff;color:#4a453d;border:1px solid #e6e2da`),
        btnStyle: `border:none;background:none;cursor:pointer;padding:6px 4px 6px 13px;font:600 12px 'Public Sans',sans-serif;color:inherit;white-space:nowrap`,
        title: active ? 'Click to turn off this search' : 'Apply this search',
      };
    });
    const saveConfirmStyle = `border:none;background:${accent};color:#fff;border-radius:20px;padding:5px 12px;font:600 11.5px 'Public Sans',sans-serif;cursor:pointer`;
    const hasSavedUI = savedChips.length > 0 || canSave || this.state.saveFilterOpen;

    const total = this.state.tasks.length;
    const done = this.state.tasks.filter((t) => normStatus(t) === 'done').length;
    const addBtnStyle = `display:inline-flex;align-items:center;gap:6px;padding:9px 16px;background:${accent};color:#fff;border:none;border-radius:11px;font:600 13px 'Public Sans',sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(31,29,27,.1)`;
    const sel = this.state.tasks.find((t) => t.id === this.state.selectedId);
    const modalHint = sel ? `Adds below "${sel.name.length > 34 ? sel.name.slice(0, 34) + '…' : sel.name}"` : '';
    // New task modal only lets you choose from existing (non-archived) tags —
    // selected chips render solid, unselected in the tag's pastel style.
    const modalTagChips: ModalTagChipVM[] = reg
      .filter((g) => !g.archived)
      .map((g) => {
        const c = this.tagColor(g.name);
        const on = this.state.modalTags.includes(g.name);
        const base = "display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border-radius:20px;font:600 12px 'Public Sans',sans-serif;cursor:pointer;transition:all .12s;";
        return {
          name: g.name,
          style: base + (on ? `background:${c.fg};color:#fff;border:1px solid ${c.fg}` : `background:${c.bg};color:${c.fg};border:1px solid ${c.br}`),
        };
      });
    const modalSubmitStyle = `padding:9px 18px;background:${accent};color:#fff;border:none;border-radius:10px;font:600 13px 'Public Sans',sans-serif;cursor:pointer`;
    // Amber dot = connected, but this device holds edits GitHub hasn't seen yet.
    const syncDotColor = !this.state.ghToken ? '#cbc6bb' : this.state.dirty ? '#c1762a' : '#7d8b4a';
    const syncDotStyle = `width:8px;height:8px;border-radius:50%;flex:none;background:${syncDotColor}`;
    const syncStatusColor = this.state.syncStatus === 'error' ? '#b0432f' : this.state.syncStatus === 'ok' ? '#7d8b4a' : '#a49e93';
    const lastSyncLabel =
      (this.state.lastSync ? 'Last synced ' + new Date(this.state.lastSync).toLocaleString() : 'Not synced yet') +
      (this.state.dirty ? ' · not pushed yet' : '');
    const emptyLabel = q
      ? 'No tasks match your search.'
      : filterCount
        ? 'No tasks match the selected filters.'
        : 'No tasks yet — add one below.';

    const ghostHeaderBtn = css("display:inline-flex;align-items:center;gap:7px;padding:8px 14px;background:#fff;border:1px solid #e6e2da;border-radius:10px;font:600 12.5px 'Public Sans',sans-serif;color:#4a453d;cursor:pointer;box-shadow:0 1px 2px rgba(31,29,27,.03)");
    const footLinkStyle = css("border:none;background:none;cursor:pointer;font:500 12px 'JetBrains Mono',monospace;color:#a49e93;text-decoration:underline;text-underline-offset:2px");

    return (
      <div style={css("min-height:100vh;background:#f6f4ef;padding:32px 18px 60px;font-family:'Public Sans',system-ui,sans-serif;color:#22201d")}>
        <div style={css('max-width:760px;margin:0 auto')}>
          <div style={css('display:flex;align-items:flex-end;flex-wrap:wrap;gap:10px 12px;margin-bottom:20px')}>
            <h1 style={css('margin:0;font-size:24px;font-weight:800;letter-spacing:-.025em;white-space:nowrap')}>My Tasks</h1>
            <span style={css("font:500 12px 'JetBrains Mono',monospace;color:#a49e93;padding-bottom:2px")}>{`${total} task${total === 1 ? '' : 's'} · ${done} done`}</span>
            <div style={css('margin-left:auto;display:flex;gap:9px')}>
              <FilterDropdown
                open={this.state.filterPopoverOpen}
                filterChecks={filterChecks}
                filterCount={filterCount}
                filterBtnStyle={filterBtnStyle}
                filterBadgeStyle={filterBadgeStyle}
                toggleFilterPopover={this.toggleFilterPopover}
                closeFilterPopover={this.closeFilterPopover}
                onToggleFilterChip={this.onToggleFilterChip}
                clearFilters={this.clearFilters}
                stop={this.stop}
              />
              <button onClick={this.openSync} className="hv-bg" style={ghostHeaderBtn}>
                <span style={css(syncDotStyle)}></span>Sync
              </button>
              <button onClick={this.openTags} className="hv-bg" style={ghostHeaderBtn}>Manage tags</button>
            </div>
          </div>

          {hasSavedUI && (
            <SavedSearches
              savedChips={savedChips}
              noSavedFilters={savedChips.length === 0}
              saveFilterOpen={this.state.saveFilterOpen}
              saveFilterName={this.state.saveFilterName}
              showSaveCurrentBtn={canSave && !this.state.saveFilterOpen}
              saveConfirmStyle={saveConfirmStyle}
              openSaveFilter={this.openSaveFilter}
              cancelSaveFilter={this.cancelSaveFilter}
              confirmSaveFilter={this.confirmSaveFilter}
              onSaveFilterNameInput={this.onSaveFilterNameInput}
              onSaveFilterKey={this.onSaveFilterKey}
              onApplySavedFilter={this.onApplySavedFilter}
              onDeleteSavedFilter={this.onDeleteSavedFilter}
              stop={this.stop}
            />
          )}

          <div style={css('display:flex;align-items:stretch;gap:10px;margin-bottom:14px')}>
            <button onClick={this.openModal} title="Add task" style={css(addBtnStyle)}>
              <span style={css('font-size:16px;line-height:1;margin-top:-1px')}>+</span> Add task
            </button>
            <div style={css('flex:1;display:flex;align-items:center;gap:9px;padding:9px 13px;background:#fff;border:1px solid #e6e2da;border-radius:11px;box-shadow:0 1px 2px rgba(31,29,27,.03)')}>
              <span style={css('color:#bdb7ab;font-size:15px')}>⌕</span>
              <input
                value={this.state.search}
                onChange={this.onSearch}
                placeholder="Search tasks or tags…"
                style={css("flex:1;border:none;outline:none;background:none;font:400 14px 'Public Sans',sans-serif;color:#22201d")}
              />
              {this.state.search.length > 0 && (
                <button onClick={this.clearSearch} style={css('border:none;background:none;cursor:pointer;color:#bdb7ab;font-size:16px;padding:0 2px')}>×</button>
              )}
            </div>
          </div>

          <div style={css('background:#fff;border:1px solid #e6e2da;border-radius:13px;overflow:visible;box-shadow:0 1px 3px rgba(31,29,27,.05)')}>
            <div style={css("display:grid;grid-template-columns:24px 22px 22px minmax(0,1fr) auto;align-items:center;gap:9px;padding:10px 14px;border-bottom:1px solid #efece5;font:600 10px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.07em")}>
              <span></span><span></span><span></span><span>Task</span><span style={css('text-align:right')}>Tags</span>
            </div>

            <div ref={this.setListEl} className="ptm-scroll">
              {rows.map((row) => (
                <TaskRow
                  key={row.id}
                  row={row}
                  tagQuery={this.state.tagQuery}
                  onRowClick={this.onRowClick}
                  onToggle={this.onToggle}
                  onNameBlur={this.onNameBlur}
                  onNameKey={this.onNameKey}
                  onRemoveTag={this.onRemoveTag}
                  onTagQueryInput={this.onTagQueryInput}
                  onTagInputKey={this.onTagInputKey}
                  onPickSuggestion={this.onPickSuggestion}
                  onCreateTag={this.onCreateTag}
                  onAddTagClick={this.onAddTagClick}
                  onOpenDetail={this.onOpenDetail}
                  stop={this.stop}
                />
              ))}
            </div>
          </div>

          <div style={css("display:flex;justify-content:space-between;align-items:center;margin-top:13px;padding:0 4px;font:500 12px 'JetBrains Mono',monospace;color:#a49e93")}>
            <span>{`${total - done} remaining`}</span>
            <div style={css('display:flex;gap:16px;align-items:center')}>
              <button onClick={this.onImportClick} title="Load a backup file" className="hv-dark" style={footLinkStyle}>Import</button>
              <button onClick={this.exportData} title="Download a backup file" className="hv-dark" style={footLinkStyle}>Export</button>
              {done > 0 && (
                <button onClick={this.clearDone} className="hv-dark" style={footLinkStyle}>Clear done</button>
              )}
            </div>
          </div>
          <input type="file" accept="application/json,.json" ref={this.fileRef} onChange={this.onImportFile} style={{ display: 'none' }} />

          {rows.length === 0 && (
            <div style={css('text-align:center;padding:30px 0;color:#bdb7ab;font-size:13px')}>{emptyLabel}</div>
          )}
        </div>

        {this.state.tagInputId !== null && (
          <div onClick={this.closeTagPopover} style={css('position:fixed;inset:0;z-index:15')}></div>
        )}

        {this.state.syncOpen && (
          <SyncModal
            syncDotStyle={syncDotStyle}
            autoDotStyle={`display:inline-flex;align-items:center;width:34px;height:20px;border-radius:20px;padding:2px;background:${this.state.autoSync ? accent : '#d5d0c6'};cursor:pointer;transition:background .15s`}
            autoKnobStyle={`width:16px;height:16px;border-radius:50%;background:#fff;transform:translateX(${this.state.autoSync ? '14px' : '0'});transition:transform .15s`}
            modalSubmitStyle={modalSubmitStyle}
            ghConnected={!!this.state.ghToken}
            ghTokenDraft={this.state.ghTokenDraft}
            ghOwner={this.state.ghConfig.owner}
            ghRepo={this.state.ghConfig.repo}
            ghBranch={this.state.ghConfig.branch}
            ghPath={this.state.ghConfig.path}
            autoSync={this.state.autoSync}
            dirty={this.state.dirty}
            mergeLog={this.state.mergeLog}
            syncMsg={this.state.syncMsg}
            syncStatusColor={syncStatusColor}
            lastSyncLabel={lastSyncLabel}
            closeSync={this.closeSync}
            stop={this.stop}
            onTokenInput={this.onTokenInput}
            onConfigField={this.onConfigField}
            toggleAuto={this.toggleAuto}
            connectGh={this.connectGh}
            disconnectGh={this.disconnectGh}
            pullNow={() => this.pull()}
            pushNow={() => this.push(false)}
            discardLocalAndPull={this.discardLocalAndPull}
          />
        )}

        {this.state.tagsOpen && (
          <ManageTags
            activeTags={activeTags}
            archivedTags={archivedTags}
            noActiveTags={activeTags.length === 0}
            hasArchived={archivedTags.length > 0}
            newTagName={this.state.newTagName}
            addBtnStyle={addBtnStyle}
            closeTags={this.closeTags}
            onNewTagInput={this.onNewTagInput}
            onNewTagKey={this.onNewTagKey}
            addTag={this.addTag}
            toggleArchive={this.toggleArchive}
            deleteTag={this.deleteTag}
          />
        )}

        {this.state.modalOpen && (
          <AddTaskModal
            modalName={this.state.modalName}
            modalHint={modalHint}
            hasModalHint={!!sel}
            modalTagChips={modalTagChips}
            noModalTags={modalTagChips.length === 0}
            modalSubmitStyle={modalSubmitStyle}
            closeModal={this.closeModal}
            onModalInput={this.onModalInput}
            onModalKey={this.onModalKey}
            toggleModalTag={this.toggleModalTag}
            submitModal={this.submitModal}
          />
        )}

        {this.state.detailOpen && (
          <TaskDetailModal
            detailNameDraft={this.state.detailNameDraft}
            detailDescDraft={this.state.detailDescDraft}
            modalSubmitStyle={modalSubmitStyle}
            closeDetail={this.closeDetail}
            onDetailKey={this.onDetailKey}
            onDetailNameInput={this.onDetailNameInput}
            onDetailDescInput={this.onDetailDescInput}
            saveDetail={this.saveDetail}
          />
        )}
      </div>
    );
  }
}
