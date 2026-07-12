import React from 'react';
import type { Task, TagInfo, SavedFilter, GhConfig, TagColor, RowVM, TagFilterRowVM, SavedChipVM } from './types';
import * as store from './storage';
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

// Fixed values of the legacy Claude Design props (accent / density / hideCompleted).
const ACCENT = '#c1762a';
const COMPACT = true;
const HIDE_COMPLETED = false;

// Built-in pseudo-tag for filtering tasks that have no tags. Never a real tag
// (real tags are always lowercased), so it can live in filterTags without collision.
const UNTAGGED = 'Untagged';

const PALETTE: TagColor[] = [
  { fg: '#3a5ccc', bg: '#eef2fd', br: '#cdd8f7' },
  { fg: '#0d8f6f', bg: '#e8f6f0', br: '#c4e8db' },
  { fg: '#c1762a', bg: '#faf1e3', br: '#ecd8ba' },
  { fg: '#a0459b', bg: '#f9edf7', br: '#ecccea' },
  { fg: '#4b7a2b', bg: '#eef5e6', br: '#d3e6c2' },
  { fg: '#b23b5e', bg: '#fbedf1', br: '#f0cdd8' },
];

interface AppState {
  tasks: Task[];
  tags: TagInfo[];
  search: string;
  filterTags: string[];
  filterPopoverOpen: boolean;
  savedFilters: SavedFilter[];
  saveFilterOpen: boolean;
  saveFilterName: string;
  dragId: string | null;
  tagInputId: string | null;
  tagQuery: string;
  modalOpen: boolean;
  modalName: string;
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
  private _onResize: () => void;

  constructor(props: Record<string, never>) {
    super(props);
    const tasks = store.loadTasks() || [
      { id: store.uid(), name: 'Draft Q3 planning doc', tags: ['work'], done: false },
      { id: store.uid(), name: 'Reply to landlord email', tags: ['home'], done: false },
      { id: store.uid(), name: 'Book dentist appointment', tags: ['home', 'errand'], done: false },
      { id: store.uid(), name: 'Review pull request #482', tags: ['work'], done: false },
      { id: store.uid(), name: 'Renew gym membership', tags: ['errand'], done: true },
      { id: store.uid(), name: 'Plan weekend hike', tags: ['personal'], done: false },
    ];
    const savedTags = store.loadTags();
    const tags = savedTags || [...new Set(tasks.flatMap((t) => t.tags))].map((name) => ({ name, archived: false }));
    const token = store.loadGhToken();
    this.state = {
      tasks,
      tags,
      search: '',
      filterTags: [],
      filterPopoverOpen: false,
      savedFilters: store.loadSavedFilters() || [],
      saveFilterOpen: false,
      saveFilterName: '',
      dragId: null,
      tagInputId: null,
      tagQuery: '',
      modalOpen: false,
      modalName: '',
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
      narrow: typeof window !== 'undefined' && window.innerWidth < 560,
      detailOpen: false,
      detailId: null,
      detailNameDraft: '',
      detailDescDraft: '',
    };
    this._onResize = () => {
      const n = window.innerWidth < 560;
      if (n !== this.state.narrow) this.setState({ narrow: n });
    };
  }

  componentDidMount() {
    window.addEventListener('resize', this._onResize);
    if (this.state.ghToken) this.pull();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._onResize);
    clearTimeout(this._pushT);
  }

  saveTags(tags: TagInfo[]) {
    store.saveTags(tags);
    this.scheduleAutoPush();
  }

  save(tasks: Task[]) {
    store.saveTasks(tasks);
    this.scheduleAutoPush();
  }

  commit(tasks: Task[], extra?: Partial<AppState>) {
    this.save(tasks);
    this.setState(Object.assign({ tasks }, extra || {}) as Pick<AppState, 'tasks'>);
  }

  // ---- GitHub sync ----
  scheduleAutoPush() {
    if (this._applyingRemote) return;
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

  async pull() {
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
      const text = decodeContent(j.content || '');
      const data = JSON.parse(text);
      const tasks: Task[] = Array.isArray(data.tasks) ? data.tasks : [];
      const tags: TagInfo[] = Array.isArray(data.tags)
        ? data.tags
        : [...new Set(tasks.flatMap((t) => t.tags || []))].map((name) => ({ name, archived: false }));
      this._applyingRemote = true;
      store.saveTasks(tasks);
      store.saveTags(tags);
      const now = new Date().toISOString();
      store.saveLastSync(now);
      this.setState({ tasks, tags, ghSha: j.sha, syncStatus: 'ok', syncMsg: 'Pulled the latest from GitHub.', lastSync: now, selectedId: null, tagInputId: null });
      this._applyingRemote = false;
    } catch (err) {
      this._applyingRemote = false;
      this.setState({ syncStatus: 'error', syncMsg: 'Pull failed: ' + (err as Error).message });
    }
  }

  async push(silent?: boolean) {
    if (!this.state.ghToken) {
      if (!silent) this.setState({ syncStatus: 'error', syncMsg: 'Add a token and press Connect first.' });
      return;
    }
    this.setState({ syncStatus: 'busy', syncMsg: silent ? 'Auto-syncing…' : 'Pushing to GitHub…' });
    try {
      const c = this.state.ghConfig;
      const headers = ghHeaders(this.state.ghToken);
      let sha = this.state.ghSha;
      try {
        const head = await fetch(`${apiUrl(c)}?ref=${encodeURIComponent(c.branch)}&t=${Date.now()}`, { headers, cache: 'no-store' });
        if (head.ok) sha = (await head.json()).sha;
        else if (head.status === 404) sha = null;
      } catch {
        /* keep previous sha */
      }
      const data = { version: 2, exportedAt: new Date().toISOString(), tasks: this.state.tasks, tags: this.state.tags };
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
      const now = new Date().toISOString();
      store.saveLastSync(now);
      this.setState({ ghSha: j.content && j.content.sha, syncStatus: 'ok', syncMsg: 'Saved to GitHub.', lastSync: now });
    } catch (err) {
      this.setState({ syncStatus: 'error', syncMsg: 'Push failed: ' + (err as Error).message });
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
  toggleFilterTag(name: string) {
    this.setState((s) => ({
      filterTags: s.filterTags.includes(name) ? s.filterTags.filter((x) => x !== name) : [...s.filterTags, name],
    }));
  }
  onToggleFilterChip = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    this.toggleFilterTag(e.currentTarget.dataset.tag || '');
  };
  clearFilters = () => this.setState({ filterTags: [] });
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
    const entry: SavedFilter = { id: store.uid(), name, tags: [...this.state.filterTags], search: this.state.search };
    const list = [...this.state.savedFilters, entry];
    store.saveSavedFilters(list);
    this.setState({ savedFilters: list, saveFilterOpen: false, saveFilterName: '' });
  };
  onApplySavedFilter = (e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    const entry = this.state.savedFilters.find((f) => f.id === id);
    if (!entry) return;
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    const active = sameSet(entry.tags || [], this.state.filterTags) && (entry.search || '') === this.state.search;
    if (active) {
      this.setState({ filterTags: [], search: '', filterPopoverOpen: false });
      return;
    }
    this.setState({ filterTags: [...entry.tags], search: entry.search || '', filterPopoverOpen: false });
  };
  onDeleteSavedFilter = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    const list = this.state.savedFilters.filter((f) => f.id !== id);
    store.saveSavedFilters(list);
    this.setState({ savedFilters: list });
  };

  onToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = this.rowOf(e);
    this.commit(this.state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };
  onRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const id = this.rowOf(e);
    if (!id) return;
    this.setState((s) => ({ selectedId: s.selectedId === id ? null : id }));
  };
  clearDone = () => this.commit(this.state.tasks.filter((t) => !t.done));

  // ---- add-task modal ----
  openModal = () => this.setState({ modalOpen: true, modalName: '' });
  closeModal = () => this.setState({ modalOpen: false });
  stop = (e: React.SyntheticEvent) => e.stopPropagation();
  onModalInput = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ modalName: e.target.value });
  submitModal = () => {
    const v = this.state.modalName.trim();
    if (!v) return;
    const nt: Task = { id: store.uid(), name: v, tags: [], done: false };
    const arr = [...this.state.tasks];
    const idx = this.state.selectedId ? arr.findIndex((t) => t.id === this.state.selectedId) : -1;
    if (idx >= 0) arr.splice(idx + 1, 0, nt);
    else arr.push(nt);
    this.commit(arr, { modalOpen: false, modalName: '', selectedId: nt.id });
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
      reg = [...reg, { name, archived: false }];
      this.saveTags(reg);
    }
    const tasks = this.state.tasks.map((t) => (t.id === id && !t.tags.includes(name) ? { ...t, tags: [...t.tags, name] } : t));
    this.save(tasks);
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
    const data = { version: 2, exportedAt: new Date().toISOString(), tasks: this.state.tasks, tags: this.state.tags };
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
        const tasks: Task[] = Array.isArray(data.tasks) ? data.tasks : [];
        if (!tasks.length && !window.confirm('This backup has no tasks. Import anyway?')) return;
        if (!window.confirm(`Replace your current list with this backup (${tasks.length} task${tasks.length === 1 ? '' : 's'})? This cannot be undone.`)) return;
        const tags: TagInfo[] = Array.isArray(data.tags)
          ? data.tags
          : [...new Set(tasks.flatMap((t) => t.tags || []))].map((name) => ({ name, archived: false }));
        this.save(tasks);
        this.saveTags(tags);
        this.setState({ tasks, tags, selectedId: null, tagInputId: null, tagsOpen: false });
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
    const reg = [...this.state.tags, { name: v, archived: false }];
    this.saveTags(reg);
    this.setState({ tags: reg, newTagName: '' });
  };
  onNewTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.addTag();
    }
  };
  toggleArchive = (e: React.MouseEvent<HTMLButtonElement>) => {
    const name = e.currentTarget.dataset.tag;
    const reg = this.state.tags.map((t) => (t.name === name ? { ...t, archived: !t.archived } : t));
    this.saveTags(reg);
    this.setState({ tags: reg });
  };
  deleteTag = (e: React.MouseEvent<HTMLButtonElement>) => {
    const name = e.currentTarget.dataset.tag;
    const reg = this.state.tags.filter((t) => t.name !== name);
    const tasks = this.state.tasks.map((t) => ({ ...t, tags: t.tags.filter((x) => x !== name) }));
    this.saveTags(reg);
    this.save(tasks);
    this.setState({ tags: reg, tasks });
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
    this.save(this.state.tasks);
    this.setState({ dragId: null });
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
    const hideCompleted = HIDE_COMPLETED;
    const pad = compact ? '5px 14px' : '9px 14px';
    const nameFont = compact ? "500 13px 'Public Sans',sans-serif" : "500 14px 'Public Sans',sans-serif";

    const q = this.state.search.trim().toLowerCase();
    let visible = this.state.tasks;
    if (hideCompleted) visible = visible.filter((t) => !t.done);
    if (q) visible = visible.filter((t) => t.name.toLowerCase().includes(q) || t.tags.some((tg) => tg.includes(q)));

    const activeFilterTags = this.state.filterTags;
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

    const reg = this.state.tags;
    const tq = (this.state.tagQuery || '').trim().toLowerCase();

    const narrow = this.state.narrow;
    const rows: RowVM[] = visible.map((t) => {
      const dragging = t.id === this.state.dragId;
      const selected = t.id === this.state.selectedId;
      const open = t.id === this.state.tagInputId;
      const avail = open ? reg.filter((g) => !g.archived && !t.tags.includes(g.name) && (!tq || g.name.includes(tq))) : [];
      const canCreate = open && tq.length > 0 && !reg.some((g) => g.name === tq);
      return {
        id: t.id,
        name: t.name,
        done: t.done,
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
        checkStyle:
          `width:17px;height:17px;border:1.6px solid ${t.done ? accent : '#cdc7bc'};border-radius:5px;` +
          `background:${t.done ? accent : '#fff'};color:#fff;font-size:11px;line-height:1;display:grid;place-items:center;` +
          `cursor:pointer;padding:0;transition:all .12s` +
          (narrow ? ';grid-column:4;grid-row:2;justify-self:center' : ''),
        detailStyle:
          `display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1.6px solid #d8d3c8;border-radius:5px;background:#fff;color:#948d80;cursor:pointer;padding:0;font-size:11px;line-height:1;transition:all .12s` +
          (narrow ? ';grid-column:3;grid-row:2;justify-self:center' : ''),
        nameStyle:
          `font:${nameFont};padding:2px 4px;margin:-2px 0;border-radius:5px;min-width:30px;cursor:text;` +
          (t.done ? 'text-decoration:line-through;color:#aca699' : 'color:#22201d') +
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

    const filterableTags = reg.filter((g) => !g.archived && counts(g.name) > 0);
    const filterChecks: TagFilterRowVM[] = filterableTags.map((g) => {
      const c = this.tagColor(g.name);
      const active = activeFilterTags.includes(g.name);
      return {
        name: g.name,
        count: counts(g.name),
        active,
        checkStyle: `width:15px;height:15px;border-radius:4px;flex:none;display:grid;place-items:center;border:1.5px solid ${active ? c.fg : '#d8d3c8'};background:${active ? c.fg : '#fff'}`,
        dotStyle: `width:8px;height:8px;border-radius:50%;flex:none;background:${c.fg}`,
      };
    });
    // "Untagged" pseudo-tag: prepended as the first filter option, shown only when
    // some task has no tags. Deliberately styled apart from real tags (neutral grey,
    // hollow dashed dot).
    const untaggedCount = this.state.tasks.filter((t) => t.tags.length === 0).length;
    if (untaggedCount > 0) {
      filterChecks.unshift({
        name: UNTAGGED,
        count: untaggedCount,
        active: untaggedFilterActive,
        checkStyle: `width:15px;height:15px;border-radius:4px;flex:none;display:grid;place-items:center;border:1.5px solid ${untaggedFilterActive ? '#6b655b' : '#d8d3c8'};background:${untaggedFilterActive ? '#6b655b' : '#fff'}`,
        dotStyle: 'width:8px;height:8px;border-radius:50%;flex:none;border:1.4px dashed #b3ada2;background:transparent',
      });
    }
    const filterCount = activeFilterTags.length;
    const filterBtnStyle = `display:inline-flex;align-items:center;gap:7px;padding:8px 14px;background:${filterCount ? accent + '14' : '#fff'};border:1px solid ${filterCount ? accent : '#e6e2da'};border-radius:10px;font:600 12.5px 'Public Sans',sans-serif;color:${filterCount ? accent : '#4a453d'};cursor:pointer;box-shadow:0 1px 2px rgba(31,29,27,.03)`;
    const filterBadgeStyle = `display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:20px;background:${accent};color:#fff;font:700 10px 'JetBrains Mono',monospace`;

    // Saved searches: a chip is "active" when its tag set (order-independent) and search string match the current filter.
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    const canSave = activeFilterTags.length > 0 || q.length > 0;
    const savedChips: SavedChipVM[] = this.state.savedFilters.map((sf) => {
      const active = sameSet(sf.tags || [], activeFilterTags) && (sf.search || '') === this.state.search;
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
    const done = this.state.tasks.filter((t) => t.done).length;
    const addBtnStyle = `display:inline-flex;align-items:center;gap:6px;padding:9px 16px;background:${accent};color:#fff;border:none;border-radius:11px;font:600 13px 'Public Sans',sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(31,29,27,.1)`;
    const sel = this.state.tasks.find((t) => t.id === this.state.selectedId);
    const modalHint = sel ? `Adds below "${sel.name.length > 34 ? sel.name.slice(0, 34) + '…' : sel.name}"` : '';
    const modalSubmitStyle = `padding:9px 18px;background:${accent};color:#fff;border:none;border-radius:10px;font:600 13px 'Public Sans',sans-serif;cursor:pointer`;
    const syncDotStyle = `width:8px;height:8px;border-radius:50%;flex:none;background:${this.state.ghToken ? '#0d8f6f' : '#cbc6bb'}`;
    const syncStatusColor = this.state.syncStatus === 'error' ? '#b0432f' : this.state.syncStatus === 'ok' ? '#0d8f6f' : '#a49e93';
    const lastSyncLabel = this.state.lastSync ? 'Last synced ' + new Date(this.state.lastSync).toLocaleString() : 'Not synced yet';
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

          <div style={css('background:#fff;border:1px solid #e6e2da;border-radius:13px;overflow:hidden;box-shadow:0 1px 3px rgba(31,29,27,.05)')}>
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
                <button onClick={this.clearDone} className="hv-dark" style={footLinkStyle}>Clear completed</button>
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
            modalSubmitStyle={modalSubmitStyle}
            closeModal={this.closeModal}
            stop={this.stop}
            onModalInput={this.onModalInput}
            onModalKey={this.onModalKey}
            submitModal={this.submitModal}
          />
        )}

        {this.state.detailOpen && (
          <TaskDetailModal
            detailNameDraft={this.state.detailNameDraft}
            detailDescDraft={this.state.detailDescDraft}
            modalSubmitStyle={modalSubmitStyle}
            closeDetail={this.closeDetail}
            stop={this.stop}
            onDetailNameInput={this.onDetailNameInput}
            onDetailDescInput={this.onDetailDescInput}
            saveDetail={this.saveDetail}
          />
        )}
      </div>
    );
  }
}
