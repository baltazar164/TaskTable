import { describe, it, expect } from 'vitest';
import type { Task, SyncData, Tombstones } from './types';
import { mergeSync, stampTasks, stampTags, stampFilters, emptyTombstones, normTombstones, TOMBSTONE_TTL_DAYS } from './merge';

const NOW = Date.parse('2026-08-05T12:00:00.000Z');
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60000).toISOString();

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, name: id, tags: [], status: 'todo', updatedAt: at(60), ...over };
}

function data(over: Partial<SyncData> = {}): SyncData {
  return { tasks: [], tags: [], savedFilters: [], deleted: emptyTombstones(), orderUpdatedAt: at(60), ...over };
}

function graves(over: Partial<Tombstones>): Tombstones {
  return { ...emptyTombstones(), ...over };
}

describe('stamping local edits', () => {
  it('timestamps new and changed entries, leaves untouched ones alone', () => {
    const prev = [task('a', { updatedAt: at(99) }), task('b', { updatedAt: at(99) })];
    const next = [prev[0], { ...prev[1], name: 'renamed' }, task('c', { updatedAt: undefined })];
    const r = stampTasks(prev, next, at(0));
    expect(r.list[0].updatedAt).toBe(at(99));
    expect(r.list[1].updatedAt).toBe(at(0));
    expect(r.list[2].updatedAt).toBe(at(0));
  });

  it('reports removals as tombstones and notices order changes', () => {
    const prev = [task('a'), task('b')];
    expect(stampTasks(prev, [prev[0]], at(0)).deleted).toEqual({ b: at(0) });
    expect(stampTasks(prev, [prev[1], prev[0]], at(0)).orderChanged).toBe(true);
    expect(stampTasks(prev, prev, at(0)).orderChanged).toBe(false);
  });

  it('treats a re-tagged task as edited but a re-read one as unchanged', () => {
    const prev = [task('a', { tags: ['work'], updatedAt: at(99) })];
    expect(stampTasks(prev, [{ ...prev[0] }], at(0)).list[0].updatedAt).toBe(at(99));
    expect(stampTasks(prev, [{ ...prev[0], tags: ['work', 'home'] }], at(0)).list[0].updatedAt).toBe(at(0));
  });

  it('stamps tags and saved filters the same way', () => {
    const tags = stampTags([{ name: 'work', archived: false, updatedAt: at(99) }], [{ name: 'work', archived: true }], at(0));
    expect(tags.list[0].updatedAt).toBe(at(0));
    const filters = stampFilters([], [{ id: 'f1', name: 'Work', tags: ['work'], exclude: [], search: '' }], at(0));
    expect(filters.list[0].updatedAt).toBe(at(0));
  });
});

describe('merging two copies', () => {
  it('keeps tasks that only one side has', () => {
    const m = mergeSync(data({ tasks: [task('local')] }), data({ tasks: [task('remote')] }), NOW);
    expect(m.data.tasks.map((t) => t.id).sort()).toEqual(['local', 'remote']);
    expect(m.changedTasks).toBe(1);
    expect(m.needsPush).toBe(true);
  });

  it('resolves a conflicting edit in favour of the newer side, whichever side that is', () => {
    const older = data({ tasks: [task('a', { name: 'older', updatedAt: at(10) })] });
    const newer = data({ tasks: [task('a', { name: 'newer', updatedAt: at(5) })] });
    expect(mergeSync(older, newer, NOW).data.tasks[0].name).toBe('newer');
    expect(mergeSync(newer, older, NOW).data.tasks[0].name).toBe('newer');
  });

  it('keeps the local side when timestamps tie', () => {
    const local = data({ tasks: [task('a', { name: 'mine', updatedAt: at(10) })] });
    const remote = data({ tasks: [task('a', { name: 'theirs', updatedAt: at(10) })] });
    expect(mergeSync(local, remote, NOW).data.tasks[0].name).toBe('mine');
  });

  it('beats a legacy task with no timestamp at all', () => {
    const local = data({ tasks: [task('a', { name: 'stamped', updatedAt: at(10) })] });
    const remote = data({ tasks: [{ id: 'a', name: 'legacy', tags: [], status: 'todo' }] });
    expect(mergeSync(remote, local, NOW).data.tasks[0].name).toBe('stamped');
  });

  it('does not resurrect a task the other side deleted', () => {
    const local = data({ tasks: [task('a', { updatedAt: at(30) })] });
    const remote = data({ deleted: graves({ tasks: { a: at(10) } }) });
    const m = mergeSync(local, remote, NOW);
    expect(m.data.tasks).toEqual([]);
    expect(m.changedTasks).toBe(1);
  });

  it('but does keep a task edited after that deletion', () => {
    const local = data({ tasks: [task('a', { updatedAt: at(5) })] });
    const remote = data({ deleted: graves({ tasks: { a: at(10) } }) });
    expect(mergeSync(local, remote, NOW).data.tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('forgets tombstones past their expiry so the file stops growing', () => {
    const old = new Date(NOW - (TOMBSTONE_TTL_DAYS + 1) * 86400000).toISOString();
    const m = mergeSync(data({ deleted: graves({ tasks: { gone: old } }) }), data(), NOW);
    expect(m.data.deleted.tasks).toEqual({});
  });

  it('takes the order from whichever side reordered last, with unknown tasks on top', () => {
    const a = task('a');
    const b = task('b');
    const c = task('c');
    // Local reordered 5 minutes ago, remote half an hour ago → local's order wins,
    // and "c" (which local has never seen) lands on top.
    expect(mergeSync(data({ tasks: [a, b], orderUpdatedAt: at(5) }), data({ tasks: [b, a, c], orderUpdatedAt: at(30) }), NOW).data.tasks.map((t) => t.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
    // The other way round: remote reordered last, so its order is adopted wholesale.
    expect(mergeSync(data({ tasks: [a, b], orderUpdatedAt: at(30) }), data({ tasks: [b, a, c], orderUpdatedAt: at(5) }), NOW).data.tasks.map((t) => t.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('merges tags and saved filters, honouring their deletions', () => {
    const local = data({
      tags: [{ name: 'work', archived: false, updatedAt: at(30) }],
      savedFilters: [{ id: 'f1', name: 'Mine', tags: [], exclude: [], search: '', updatedAt: at(30) }],
    });
    const remote = data({
      tags: [
        { name: 'work', archived: true, updatedAt: at(5) },
        { name: 'home', archived: false, updatedAt: at(5) },
      ],
      deleted: graves({ filters: { f1: at(5) } }),
    });
    const m = mergeSync(local, remote, NOW);
    expect(m.data.tags.find((t) => t.name === 'work')!.archived).toBe(true);
    expect(m.data.tags.map((t) => t.name).sort()).toEqual(['home', 'work']);
    expect(m.data.savedFilters).toEqual([]);
  });

  it('reports nothing to do when both sides already match', () => {
    const same = () => data({ tasks: [task('a', { updatedAt: at(10) })] });
    const m = mergeSync(same(), same(), NOW);
    expect(m.changedTasks).toBe(0);
    expect(m.needsPush).toBe(false);
  });

  it('flags needsPush when only the local side has something', () => {
    const m = mergeSync(data({ tasks: [task('a')] }), data(), NOW);
    expect(m.changedTasks).toBe(0);
    expect(m.needsPush).toBe(true);
  });

  it('survives an empty or malformed remote file', () => {
    const m = mergeSync(data({ tasks: [task('a')] }), data({ deleted: normTombstones(undefined) }), NOW);
    expect(m.data.tasks.map((t) => t.id)).toEqual(['a']);
    expect(normTombstones({ tasks: { a: 5 } }).tasks).toEqual({});
  });
});
