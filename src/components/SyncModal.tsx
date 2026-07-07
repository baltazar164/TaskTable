import React from 'react';
import { css } from '../lib/css';

interface Props {
  syncDotStyle: string;
  autoDotStyle: string;
  autoKnobStyle: string;
  modalSubmitStyle: string;
  ghConnected: boolean;
  ghTokenDraft: string;
  ghOwner: string;
  ghRepo: string;
  ghBranch: string;
  ghPath: string;
  autoSync: boolean;
  syncMsg: string;
  syncStatusColor: string;
  lastSyncLabel: string;
  closeSync: () => void;
  stop: (e: React.SyntheticEvent) => void;
  onTokenInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfigField: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleAuto: () => void;
  connectGh: () => void;
  disconnectGh: () => void;
  pullNow: () => void;
  pushNow: () => void;
}

const fieldLabelStyle = css("display:block;font:600 10px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px");
const fieldInputStyle = css("width:100%;padding:8px 10px;border:1px solid #ddd8ce;border-radius:9px;outline:none;font:500 12px 'JetBrains Mono',monospace;background:#faf9f6");
const ghostBtnStyle = css("padding:9px 15px;background:#fff;border:1px solid #e2ded5;border-radius:10px;font:600 12.5px 'Public Sans',sans-serif;color:#4a453d;cursor:pointer");

export default function SyncModal(p: Props) {
  return (
    <div
      onClick={p.closeSync}
      style={css('position:fixed;inset:0;background:rgba(31,29,27,.34);display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 40px;z-index:80;overflow:auto')}
    >
      <div onClick={p.stop} style={css('width:min(480px,94vw);background:#fff;border-radius:16px;box-shadow:0 26px 64px rgba(31,29,27,.3);padding:24px')}>
        <div style={css('display:flex;align-items:center;gap:9px;margin-bottom:4px')}>
          <span style={css(p.syncDotStyle)}></span>
          <h2 style={css("margin:0;font:700 18px 'Public Sans',sans-serif;letter-spacing:-.01em;color:#22201d")}>Sync with GitHub</h2>
        </div>
        <p style={css("margin:0 0 18px;font:400 13px 'Public Sans',sans-serif;color:#8f887c;line-height:1.5")}>
          Your tasks are saved to a file in your GitHub repo, so every device with the same repo and token stays in step.
        </p>

        <label style={css("display:block;font:600 11px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px")}>
          Personal access token
        </label>
        <input
          value={p.ghTokenDraft}
          onChange={p.onTokenInput}
          type="password"
          placeholder="ghp_… or github_pat_…"
          className="fc-borderbg"
          style={css("width:100%;padding:10px 12px;border:1px solid #ddd8ce;border-radius:10px;outline:none;font:500 13px 'JetBrains Mono',monospace;color:#22201d;background:#faf9f6")}
        />
        <p style={css("margin:7px 2px 16px;font:400 11.5px 'Public Sans',sans-serif;color:#a49e93;line-height:1.5")}>
          Create one at <span style={css('color:#3a5ccc')}>github.com/settings/tokens</span> with read/write access to <b>Contents</b> for this repo. It's stored only on this device.
        </p>

        <label style={css("display:block;font:600 11px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px")}>
          Data repo — where your tasks are saved
        </label>
        <p style={css("margin:0 0 9px 2px;font:400 11.5px 'Public Sans',sans-serif;color:#a49e93;line-height:1.5")}>
          This can be a <b>private</b> repo so your task list stays hidden. It's separate from the public repo that hosts the app.
        </p>
        <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:16px')}>
          <div>
            <label style={fieldLabelStyle}>Owner</label>
            <input value={p.ghOwner} data-k="owner" onChange={p.onConfigField} style={fieldInputStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Repo</label>
            <input value={p.ghRepo} data-k="repo" onChange={p.onConfigField} style={fieldInputStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Branch</label>
            <input value={p.ghBranch} data-k="branch" onChange={p.onConfigField} style={fieldInputStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>File path</label>
            <input value={p.ghPath} data-k="path" onChange={p.onConfigField} style={fieldInputStyle} />
          </div>
        </div>

        <div style={css('display:flex;align-items:center;gap:10px;padding:11px 13px;background:#f7f5f1;border-radius:11px;margin-bottom:16px')}>
          <span onClick={p.toggleAuto} style={css(p.autoDotStyle)}>
            <span style={css(p.autoKnobStyle)}></span>
          </span>
          <div>
            <div style={css("font:600 13px 'Public Sans',sans-serif;color:#22201d")}>Auto-sync</div>
            <div style={css("font:400 11.5px 'Public Sans',sans-serif;color:#a49e93")}>Push changes to GitHub automatically</div>
          </div>
        </div>

        {p.syncMsg && (
          <p style={css(`margin:0 0 14px;font:600 12px 'JetBrains Mono',monospace;color:${p.syncStatusColor};line-height:1.5`)}>{p.syncMsg}</p>
        )}

        <div style={css('display:flex;flex-wrap:wrap;gap:9px;align-items:center')}>
          {p.ghConnected && (
            <button onClick={p.pullNow} className="hv-bg" style={ghostBtnStyle}>↓ Pull now</button>
          )}
          {p.ghConnected && (
            <button onClick={p.pushNow} style={css(p.modalSubmitStyle)}>↑ Push now</button>
          )}
          {!p.ghConnected && (
            <button onClick={p.connectGh} style={css(p.modalSubmitStyle)}>Connect &amp; pull</button>
          )}
          {p.ghConnected && (
            <button onClick={p.connectGh} title="Save an updated token" className="hv-bg" style={ghostBtnStyle}>Update token</button>
          )}
          <span style={css("margin-left:auto;font:500 11px 'JetBrains Mono',monospace;color:#b3ada2")}>{p.lastSyncLabel}</span>
        </div>

        {p.ghConnected && (
          <div style={css('margin-top:14px;padding-top:14px;border-top:1px solid #efece5;display:flex;justify-content:space-between;align-items:center')}>
            <button
              onClick={p.disconnectGh}
              className="hv-underline"
              style={css("border:none;background:none;cursor:pointer;font:600 12px 'Public Sans',sans-serif;color:#b0432f")}
            >
              Disconnect
            </button>
            <button
              onClick={p.closeSync}
              className="hv-dark"
              style={css("border:none;background:none;cursor:pointer;font:600 12px 'Public Sans',sans-serif;color:#8f887c")}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
