import React from 'react';
import { css } from '../lib/css';

interface Props {
  detailNameDraft: string;
  detailDescDraft: string;
  modalSubmitStyle: string;
  closeDetail: () => void;
  onDetailKey: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onDetailNameInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDetailDescInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  saveDetail: () => void;
}

export default function TaskDetailModal(p: Props) {
  return (
    <div
      onKeyDown={p.onDetailKey}
      style={css('position:fixed;inset:0;background:rgba(31,29,27,.34);display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;z-index:60')}
    >
      <div style={css('width:min(430px,92vw);background:#fff;border-radius:16px;box-shadow:0 26px 64px rgba(31,29,27,.3);padding:24px 24px 20px')}>
        <h2 style={css("margin:0 0 3px;font:700 18px 'Public Sans',sans-serif;letter-spacing:-.01em;color:#22201d")}>Task details</h2>
        <p style={css("margin:0 0 16px;font:400 13px 'Public Sans',sans-serif;color:#8f887c")}>Edit the name and description.</p>

        <label style={css("display:block;margin-bottom:6px;font:600 10px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.07em")}>Name</label>
        <input
          value={p.detailNameDraft}
          onChange={p.onDetailNameInput}
          autoFocus
          className="fc-borderbg"
          style={css("width:100%;padding:11px 13px;border:1px solid #ddd8ce;border-radius:10px;outline:none;font:500 15px 'Public Sans',sans-serif;color:#22201d;background:#faf9f6;margin-bottom:14px")}
        />

        <label style={css("display:block;margin-bottom:6px;font:600 10px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.07em")}>Description</label>
        <textarea
          value={p.detailDescDraft}
          onChange={p.onDetailDescInput}
          placeholder="Add more detail…"
          className="fc-borderbg"
          style={css("width:100%;min-height:110px;padding:11px 13px;border:1px solid #ddd8ce;border-radius:10px;outline:none;font:400 13.5px 'Public Sans',sans-serif;color:#22201d;background:#faf9f6;resize:vertical;line-height:1.5")}
        />

        <div style={css('display:flex;justify-content:flex-end;gap:9px;margin-top:18px')}>
          <button
            onClick={p.closeDetail}
            className="hv-bg"
            style={css("padding:9px 16px;border:1px solid #e2ded5;background:#fff;border-radius:10px;font:600 13px 'Public Sans',sans-serif;color:#6b655b;cursor:pointer")}
          >
            Cancel
          </button>
          <button onClick={p.saveDetail} style={css(p.modalSubmitStyle)}>Save</button>
        </div>
      </div>
    </div>
  );
}
