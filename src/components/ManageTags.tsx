import React from 'react';
import { css } from '../lib/css';

export interface TagRowVM {
  name: string;
  dot: string;
  countLabel: string;
}

interface Props {
  activeTags: TagRowVM[];
  archivedTags: TagRowVM[];
  noActiveTags: boolean;
  hasArchived: boolean;
  newTagName: string;
  addBtnStyle: string;
  closeTags: () => void;
  onNewTagInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNewTagKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  addTag: () => void;
  toggleArchive: (e: React.MouseEvent<HTMLButtonElement>) => void;
  deleteTag: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const cardStyle = 'background:#fff;border:1px solid #e6e2da;border-radius:13px;overflow:hidden;box-shadow:0 1px 3px rgba(31,29,27,.05)';
const sectionHeadStyle = css("padding:10px 15px;border-bottom:1px solid #efece5;font:600 10px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.07em");
const archiveBtnStyle = css("padding:5px 11px;background:#fff;border:1px solid #e2ded5;border-radius:8px;font:600 11.5px 'Public Sans',sans-serif;color:#6b655b;cursor:pointer");
const restoreBtnStyle = css("padding:5px 11px;background:#fff;border:1px solid #e2ded5;border-radius:8px;font:600 11.5px 'Public Sans',sans-serif;color:#4a453d;cursor:pointer");
const deleteBtnStyle = css("padding:5px 11px;background:#fff;border:1px solid #eed6d2;border-radius:8px;font:600 11.5px 'Public Sans',sans-serif;color:#b0432f;cursor:pointer");

function TagListRow({ tg, archived, toggleArchive, deleteTag }: {
  tg: TagRowVM;
  archived: boolean;
  toggleArchive: Props['toggleArchive'];
  deleteTag: Props['deleteTag'];
}) {
  return (
    <div style={css('display:flex;align-items:center;gap:11px;padding:11px 15px;border-bottom:1px solid #f1eee8' + (archived ? ';opacity:.62' : ''))}>
      <span style={css(tg.dot)}></span>
      <span style={css("font:600 13px 'JetBrains Mono',monospace;color:#22201d")}>{tg.name}</span>
      <span style={css("font:500 11px 'JetBrains Mono',monospace;color:#b3ada2")}>{tg.countLabel}</span>
      <span style={css('margin-left:auto;display:flex;gap:7px')}>
        <button onClick={toggleArchive} data-tag={tg.name} className="hv-bg" style={archived ? restoreBtnStyle : archiveBtnStyle}>
          {archived ? 'Restore' : 'Archive'}
        </button>
        <button onClick={deleteTag} data-tag={tg.name} className="hv-red" style={deleteBtnStyle}>Delete</button>
      </span>
    </div>
  );
}

export default function ManageTags(p: Props) {
  return (
    <div style={css('position:fixed;inset:0;background:#f6f4ef;z-index:70;overflow:auto')}>
      <div style={css('max-width:620px;margin:0 auto;padding:28px 18px 60px')}>
        <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:22px')}>
          <button
            onClick={p.closeTags}
            title="Back to tasks"
            className="hv-bg"
            style={css("display:inline-flex;align-items:center;gap:6px;padding:8px 13px;background:#fff;border:1px solid #e6e2da;border-radius:10px;font:600 12.5px 'Public Sans',sans-serif;color:#4a453d;cursor:pointer")}
          >
            ← Tasks
          </button>
          <h1 style={css('margin:0;font-size:22px;font-weight:800;letter-spacing:-.025em')}>Manage tags</h1>
        </div>

        <div style={css('display:flex;gap:10px;margin-bottom:20px')}>
          <input
            value={p.newTagName}
            onChange={p.onNewTagInput}
            onKeyDown={p.onNewTagKey}
            placeholder="New tag name…"
            className="fc-border"
            style={css("flex:1;padding:10px 13px;background:#fff;border:1px solid #e6e2da;border-radius:11px;outline:none;font:600 13px 'JetBrains Mono',monospace;color:#22201d")}
          />
          <button onClick={p.addTag} style={css(p.addBtnStyle)}>
            <span style={css('font-size:16px;line-height:1;margin-top:-1px')}>+</span> Add tag
          </button>
        </div>

        <div style={css(cardStyle)}>
          <div style={sectionHeadStyle}>Active</div>
          {p.activeTags.map((tg) => (
            <TagListRow key={tg.name} tg={tg} archived={false} toggleArchive={p.toggleArchive} deleteTag={p.deleteTag} />
          ))}
          {p.noActiveTags && (
            <div style={css('padding:20px 15px;text-align:center;color:#bdb7ab;font-size:13px')}>No active tags — add one above.</div>
          )}
        </div>

        {p.hasArchived && (
          <div style={css(cardStyle + ';margin-top:18px')}>
            <div style={sectionHeadStyle}>Archived</div>
            {p.archivedTags.map((tg) => (
              <TagListRow key={tg.name} tg={tg} archived toggleArchive={p.toggleArchive} deleteTag={p.deleteTag} />
            ))}
          </div>
        )}

        <p style={css("margin:16px 4px 0;font:500 12px 'JetBrains Mono',monospace;color:#a49e93;line-height:1.6")}>
          Archived tags stay on their tasks but won't appear as suggestions. Deleting a tag removes it from every task.
        </p>
      </div>
    </div>
  );
}
