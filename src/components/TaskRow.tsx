import React from 'react';
import type { RowVM } from '../types';
import { css } from '../lib/css';

export interface TaskRowHandlers {
  onRowClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onNameBlur: (e: React.FocusEvent<HTMLSpanElement>) => void;
  onNameKey: (e: React.KeyboardEvent<HTMLSpanElement>) => void;
  onRemoveTag: (e: React.MouseEvent<HTMLSpanElement>) => void;
  onTagQueryInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTagInputKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPickSuggestion: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onCreateTag: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onAddTagClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  stop: (e: React.SyntheticEvent) => void;
}

interface Props extends TaskRowHandlers {
  row: RowVM;
  tagQuery: string;
}

const gripDot = css('width:3px;height:3px;border-radius:50%;background:currentColor');

export default function TaskRow({ row, tagQuery, ...h }: Props) {
  return (
    <div data-task-row="" data-id={row.id} onClick={h.onRowClick} style={css(row.rowStyle)}>
      <span data-grip="1" title="Drag to reorder" className="hv-grip" style={css(row.gripStyle)}>
        <span style={css('display:grid;grid-template-columns:1fr 1fr;gap:2.5px;width:9px')}>
          <i style={gripDot}></i><i style={gripDot}></i><i style={gripDot}></i>
          <i style={gripDot}></i><i style={gripDot}></i><i style={gripDot}></i>
        </span>
      </span>

      <button onClick={h.onToggle} style={css(row.checkStyle)}>
        {row.done && <span>✓</span>}
      </button>

      <span
        contentEditable
        suppressContentEditableWarning
        onBlur={h.onNameBlur}
        onKeyDown={h.onNameKey}
        className="fc-bg"
        style={css(row.nameStyle)}
      >
        {row.name}
      </span>

      <div style={css(row.tagWrapStyle)}>
        {row.tagPills.map((pill) => (
          <span key={pill.name} style={css(pill.style)}>
            {pill.name}
            <span
              onClick={h.onRemoveTag}
              data-tag={pill.name}
              className="hv-op"
              style={css('cursor:pointer;opacity:.5;font-weight:700;padding-left:1px')}
            >
              ×
            </span>
          </span>
        ))}
        {row.showTagInput && (
          <span style={css('position:relative;display:inline-block;z-index:20')} onClick={h.stop}>
            <input
              value={tagQuery}
              onChange={h.onTagQueryInput}
              onKeyDown={h.onTagInputKey}
              autoFocus
              placeholder="find or create…"
              style={css("width:120px;border:1px solid #bdb7ab;border-radius:20px;padding:3px 9px;outline:none;font:600 11px 'JetBrains Mono',monospace;background:#fff")}
            />
            <div style={css('position:absolute;top:calc(100% + 5px);right:0;background:#fff;border:1px solid #e4e0d8;border-radius:11px;box-shadow:0 12px 30px rgba(31,29,27,.18);padding:6px;min-width:158px;max-height:196px;overflow:auto;display:flex;flex-direction:column;gap:3px')}>
              {row.suggestions.map((sg) => (
                <button
                  key={sg.name}
                  onClick={h.onPickSuggestion}
                  data-tag={sg.name}
                  className="hv-bg"
                  style={css("display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:none;background:none;padding:6px 8px;border-radius:7px;cursor:pointer;font:600 11.5px 'JetBrains Mono',monospace;color:#4a453d")}
                >
                  <span style={css(sg.dot)}></span>
                  {sg.name}
                </button>
              ))}
              {row.showCreate && (
                <button
                  onClick={h.onCreateTag}
                  className="hv-blue"
                  style={css("display:flex;align-items:center;gap:6px;width:100%;text-align:left;border:none;background:none;padding:6px 8px;border-radius:7px;cursor:pointer;font:600 11.5px 'JetBrains Mono',monospace;color:#3a5ccc")}
                >
                  + Create "{row.createLabel}"
                </button>
              )}
              {row.emptySuggest && (
                <span style={css("padding:7px 8px;color:#b3ada2;font:500 11px 'JetBrains Mono',monospace")}>All tags added</span>
              )}
            </div>
          </span>
        )}
        {row.showAddBtn && (
          <button
            onClick={h.onAddTagClick}
            title="Add tag"
            className="hv-addtag"
            style={css('border:1px dashed #d5d0c6;background:none;color:#b3ada2;border-radius:20px;width:20px;height:20px;cursor:pointer;font-size:13px;line-height:1;padding:0')}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
