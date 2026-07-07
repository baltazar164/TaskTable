import React from 'react';
import { css } from '../lib/css';

interface Props {
  modalName: string;
  modalHint: string;
  hasModalHint: boolean;
  modalSubmitStyle: string;
  closeModal: () => void;
  stop: (e: React.SyntheticEvent) => void;
  onModalInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onModalKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  submitModal: () => void;
}

export default function AddTaskModal(p: Props) {
  return (
    <div
      onClick={p.closeModal}
      style={css('position:fixed;inset:0;background:rgba(31,29,27,.34);display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;z-index:60')}
    >
      <div onClick={p.stop} style={css('width:min(430px,92vw);background:#fff;border-radius:16px;box-shadow:0 26px 64px rgba(31,29,27,.3);padding:24px 24px 20px')}>
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
