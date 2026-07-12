import React from 'react';
import type { TagFilterRowVM } from '../types';
import { css } from '../lib/css';

interface Props {
  open: boolean;
  filterChecks: TagFilterRowVM[];
  filterCount: number;
  filterBtnStyle: string;
  filterBadgeStyle: string;
  toggleFilterPopover: () => void;
  closeFilterPopover: () => void;
  onToggleFilterChip: (e: React.MouseEvent<HTMLButtonElement>) => void;
  clearFilters: () => void;
  stop: (e: React.SyntheticEvent) => void;
}

const panelStyle = css('position:absolute;top:calc(100% + 8px);right:0;z-index:17;background:#fff;border:1px solid #e4e0d8;border-radius:12px;box-shadow:0 12px 30px rgba(31,29,27,.18);padding:8px;min-width:190px');
const headStyle = css("padding:6px 8px 7px;font:600 10px 'JetBrains Mono',monospace;color:#b3ada2;text-transform:uppercase;letter-spacing:.06em");
const legendStyle = css("display:flex;gap:12px;padding:0 8px 8px;font:600 9.5px 'JetBrains Mono',monospace;color:#c4beb2;text-transform:uppercase;letter-spacing:.04em");
const rowStyle = css('width:100%;display:flex;align-items:center;gap:8px;border:none;background:none;padding:7px 8px;border-radius:8px;cursor:pointer;color:#4a453d');
const countStyle = css("margin-left:auto;font:500 10px 'JetBrains Mono',monospace;color:#b3ada2");
const emptyStyle = css("padding:10px 8px;font:500 12px 'Public Sans',sans-serif;color:#bdb7ab");
const clearStyle = css("width:100%;text-align:left;border:none;background:none;padding:7px 8px;margin-top:2px;border-radius:8px;cursor:pointer;color:#b0432f;font:600 11.5px 'Public Sans',sans-serif");

export default function FilterDropdown(p: Props) {
  return (
    <div style={css('position:relative')}>
      <button onClick={p.toggleFilterPopover} className={p.filterCount ? undefined : 'hv-bg'} style={css(p.filterBtnStyle)}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M1 2.2h11M3 6.5h7M5 10.8h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Tags
        {p.filterCount > 0 && <span style={css(p.filterBadgeStyle)}>{p.filterCount}</span>}
      </button>

      {p.open && (
        <>
          <div onClick={p.closeFilterPopover} style={css('position:fixed;inset:0;z-index:16')}></div>
          <div onClick={p.stop} style={panelStyle}>
            <div style={headStyle}>Filter by tag</div>
            <div style={legendStyle}><span>tap to cycle</span><span>✓ show</span><span>− hide</span></div>
            {p.filterChecks.length === 0 && <div style={emptyStyle}>No tags yet.</div>}
            {p.filterChecks.map((f) => (
              <button key={f.name} data-tag={f.name} title={f.title} onClick={p.onToggleFilterChip} className="hv-bg" style={rowStyle}>
                <span style={css(f.boxStyle)}>{f.glyph}</span>
                <span style={css(f.dotStyle)}></span>
                <span style={css(f.nameStyle)}>{f.name}</span>
                <span style={countStyle}>{f.count}</span>
              </button>
            ))}
            {p.filterCount > 0 && (
              <button onClick={p.clearFilters} className="hv-red" style={clearStyle}>Clear filters</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
