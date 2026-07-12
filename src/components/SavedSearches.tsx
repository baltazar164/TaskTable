import React from 'react';
import type { SavedChipVM } from '../types';
import { css } from '../lib/css';

interface Props {
  savedChips: SavedChipVM[];
  noSavedFilters: boolean;
  saveFilterOpen: boolean;
  saveFilterName: string;
  showSaveCurrentBtn: boolean;
  saveConfirmStyle: string;
  openSaveFilter: () => void;
  cancelSaveFilter: () => void;
  confirmSaveFilter: () => void;
  onSaveFilterNameInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveFilterKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onApplySavedFilter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteSavedFilter: (e: React.MouseEvent<HTMLSpanElement>) => void;
  stop: (e: React.SyntheticEvent) => void;
}

const barStyle = css('display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:14px');
const labelStyle = css("font:600 10px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap");
const deleteStyle = css('cursor:pointer;opacity:.5;font-weight:700;padding:0 7px 0 2px');
const emptyStyle = css("font:500 12px 'Public Sans',sans-serif;color:#bdb7ab");
const inputGroupStyle = css('display:inline-flex;align-items:center;gap:5px');
const inputStyle = css("width:150px;border:1px solid #bdb7ab;border-radius:20px;padding:5px 11px;outline:none;font:600 12px 'Public Sans',sans-serif;background:#fff");
const cancelStyle = css("border:none;background:none;color:#a49e93;cursor:pointer;font:600 11.5px 'Public Sans',sans-serif;padding:5px 4px");
const saveBtnStyle = css("display:inline-flex;align-items:center;gap:5px;border:1px dashed #d5d0c6;background:none;color:#8f887c;border-radius:20px;padding:5px 12px;font:600 11.5px 'Public Sans',sans-serif;cursor:pointer;white-space:nowrap");

export default function SavedSearches(p: Props) {
  return (
    <div style={barStyle}>
      <span style={labelStyle}>Saved searches</span>

      {p.savedChips.map((sf) => (
        <span key={sf.id} style={css(sf.wrapStyle)}>
          <button data-id={sf.id} onClick={p.onApplySavedFilter} title={sf.title} style={css(sf.btnStyle)}>
            {sf.name}
          </button>
          <span data-id={sf.id} onClick={p.onDeleteSavedFilter} title="Delete saved search" className="hv-op" style={deleteStyle}>
            ×
          </span>
        </span>
      ))}

      {p.noSavedFilters && <span style={emptyStyle}>No saved searches yet</span>}

      {p.saveFilterOpen && (
        <span style={inputGroupStyle} onClick={p.stop}>
          <input
            value={p.saveFilterName}
            onChange={p.onSaveFilterNameInput}
            onKeyDown={p.onSaveFilterKey}
            autoFocus
            placeholder="Name this search…"
            title="Name this search"
            style={inputStyle}
          />
          <button onClick={p.confirmSaveFilter} style={css(p.saveConfirmStyle)}>Save</button>
          <button onClick={p.cancelSaveFilter} style={cancelStyle}>Cancel</button>
        </span>
      )}

      {p.showSaveCurrentBtn && (
        <button onClick={p.openSaveFilter} className="hv-save" style={saveBtnStyle}>☆ Save search</button>
      )}
    </div>
  );
}
