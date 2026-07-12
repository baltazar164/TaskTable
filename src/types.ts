export interface Task {
  id: string;
  name: string;
  tags: string[];
  done: boolean;
  description?: string;
}

export interface TagInfo {
  name: string;
  archived: boolean;
}

/** A captured filter combination (tag filters + search text) the user can re-apply. */
export interface SavedFilter {
  id: string;
  name: string;
  tags: string[];
  search: string;
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

/** Precomputed view-model for one tag row in the filter popover. */
export interface TagFilterRowVM {
  name: string;
  count: number;
  active: boolean;
  checkStyle: string;
  dotStyle: string;
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

/** Precomputed view-model for one task row (style strings are parsed by css()). */
export interface RowVM {
  id: string;
  name: string;
  done: boolean;
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
