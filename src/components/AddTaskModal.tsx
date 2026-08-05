import React from 'react';
import type { ModalTagChipVM } from '../types';
import { css } from '../lib/css';

interface Props {
  modalName: string;
  modalHint: string;
  hasModalHint: boolean;
  modalTagChips: ModalTagChipVM[];
  noModalTags: boolean;
  modalSubmitStyle: string;
  closeModal: () => void;
  onModalInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onModalKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  toggleModalTag: (e: React.MouseEvent<HTMLButtonElement>) => void;
  submitModal: () => void;
}

export default function AddTaskModal(p: Props) {
  return (
    <div
      style={css('position:fixed;inset:0;background:rgba(31,29,27,.34);display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;z-index:60')}
    >
      <div style={css('width:min(430px,92vw);background:#fff;border-radius:16px;box-shadow:0 26px 64px rgba(31,29,27,.3);padding:24px 24px 20px')}>
        <h2 style={css("margin:0 0 3px;font:700 18px 'Public Sans',sans-serif;letter-spacing:-.01em;color:#22201d")}>New task</h2>
        <p style={css("margin:0 0 16px;font:400 13px 'Public Sans',sans-serif;color:#8f887c")}>Give your task a name.</p>
        <input
          value={p.modalName}
          onChange={p.onModalInput}
          onKeyDown={p.onModalKey}
          autoFocus
          placeholder="e.g. Prepare Monday standup"
          className="fc-borderbg"
          style={css("width:100%;padding:11px 13px;border:1px solid #ddd8ce;border-radius:10px;outline:none;font:500 15px 'Public Sans',sans-serif;color:#22201d;background:#faf9f6")}
        />
        {p.hasModalHint && (
          <p style={css("margin:11px 2px 0;font:500 12px 'JetBrains Mono',monospace;color:#a49e93")}>↳ {p.modalHint}</p>
        )}
        <div style={css('margin-top:16px')}>
          <label style={css("display:block;font:600 10px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px")}>Tags</label>
          <div style={css('display:flex;flex-wrap:wrap;gap:7px;align-items:center')}>
            {p.modalTagChips.map((mt) => (
              <button key={mt.name} onClick={p.toggleModalTag} data-tag={mt.name} style={css(mt.style)}>
                {mt.name}
              </button>
            ))}
            {p.noModalTags && (
              <span style={css("font:500 12px 'Public Sans',sans-serif;color:#bdb7ab")}>No tags yet — create one below.</span>
            )}
          </div>
        </div>
        <div style={css('display:flex;justify-content:flex-end;gap:9px;margin-top:18px')}>
          <button
            onClick={p.closeModal}
            className="hv-bg"
            style={css("padding:9px 16px;border:1px solid #e2ded5;background:#fff;border-radius:10px;font:600 13px 'Public Sans',sans-serif;color:#6b655b;cursor:pointer")}
          >
            Cancel
          </button>
          <button onClick={p.submitModal} style={css(p.modalSubmitStyle)}>Add task</button>
        </div>
      </div>
    </div>
  );
}
