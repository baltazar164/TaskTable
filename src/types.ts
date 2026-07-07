export interface Task {
  id: string;
  name: string;
  tags: string[];
  done: boolean;
}

export interface TagInfo {
  name: string;
  archived: boolean;
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
  nameStyle: string;
  tagPills: { name: string; style: string }[];
}
