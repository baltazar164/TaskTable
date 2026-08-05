/** A task moves forward through this cycle: To do → Doing → Done → To do. */
export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  name: string;
  tags: string[];
  status: TaskStatus;
  description?: string;
  /** ISO time of the last edit. Drives merging: the newer side of a conflict wins. */
  updatedAt?: string;
}

export interface TagInfo {
  name: string;
  archived: boolean;
  updatedAt?: string;
}

/** A captured filter combination (tag filters + search text) the user can re-apply. */
export interface SavedFilter {
  id: string;
  name: string;
  tags: string[];
  exclude: string[];
  search: string;
  updatedAt?: string;
}

/**
 * Deletion records (id/name → ISO time). Without these, anything deleted here
 * would come straight back from another device's copy on the next merge.
 */
export interface Tombstones {
  tasks: Record<string, string>;
  tags: Record<string, string>;
  filters: Record<string, string>;
}

/** Everything that travels to GitHub and takes part in a merge. */
export interface SyncData {
  tasks: Task[];
  tags: TagInfo[];
  savedFilters: SavedFilter[];
  deleted: Tombstones;
  /** ISO time the task order last changed — the side that reordered later wins. */
  orderUpdatedAt: string;
}

/** One line of the local merge history: when, and how many tasks it touched. */
export interface MergeLogEntry {
  at: string;
  tasks: number;
}

export interface GhConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export interface TagColor {
  fg: string;
  bg: string;
  br: string;
}

/** Precomputed view-model for one tag row in the filter popover (tri-state). */
export interface TagFilterRowVM {
  name: string;
  count: number;
  active: boolean; // "show only"
  excluded: boolean; // "hide"
  boxStyle: string; // the single tri-state box
  glyph: string; // '✓' | '−' | ''
  dotStyle: string;
  nameStyle: string; // adds strikethrough when excluded
  title: string; // tooltip for current state
}

/** Precomputed view-model for one saved-search chip. */
export interface SavedChipVM {
  id: string;
  name: string;
  active: boolean;
  wrapStyle: string;
  btnStyle: string;
  title: string;
}

/** Precomputed view-model for one selectable tag chip in the New task modal. */
export interface ModalTagChipVM {
  name: string;
  style: string; // solid when selected, pastel when not
}

/** Precomputed view-model for one task row (style strings are parsed by css()). */
export interface RowVM {
  id: string;
  name: string;
  status: TaskStatus;
  checkTitle: string; // tooltip: current status + next on click
  hasDesc: boolean;
  detailTitle: string;
  showTagInput: boolean;
  showAddBtn: boolean;
  suggestions: { name: string; dot: string }[];
  showCreate: boolean;
  createLabel: string;
  emptySuggest: boolean;
  rowStyle: string;
  gripStyle: string;
  tagWrapStyle: string;
  checkStyle: string;
  detailStyle: string;
  nameStyle: string;
  tagPills: { name: string; style: string }[];
}
