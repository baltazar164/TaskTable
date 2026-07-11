---
name: run
description: Launch the TaskTable dev app (Vite + React + TS) and open it in a browser to see changes running. Use when asked to run, start, preview, or screenshot the app, or to confirm a change works in the real UI.
---

# Run TaskTable

TaskTable is a single-page Vite + React + TypeScript app (`src/App.tsx` is the
whole UI — one class component, inline styles via the `css()` helper). State
persists to `localStorage`; there is no backend.

## Scripts (`package.json`)

- `npm run dev` — Vite dev server with HMR (use this to run/preview).
- `npm run build` — `tsc --noEmit && vite build` (typecheck + production bundle).
- `npm run preview` — serve the built `dist/`.

## Launch it

Preferred: start via the browser tooling so a tab opens automatically.
`.claude/launch.json` defines a `vite-dev` config (port 5173, `autoPort: true`),
so:

```
preview_start { name: "vite-dev" }
```

Or from a terminal: `npm run dev`.

## Gotchas (learned the hard way)

- **Base path.** `vite.config.ts` sets `base: '/TaskTable/'` (for GitHub Pages).
  The dev server therefore serves the app at
  `http://localhost:<port>/TaskTable/`, **not** at `/`. Opening the bare root
  `/` returns nothing and looks like a hang. Always navigate to the
  **`/TaskTable/` path**.
- **Port.** 5173 is frequently already in use; Vite auto-increments (5174,
  5175, …). Read the dev-server logs for the actual `Local: http://localhost:<port>/…`
  line — don't assume 5173. With `preview_start`, check `preview_logs` for the
  chosen port.
- **In-app Browser pane can be flaky** (screenshots time out, tabs drop). If it
  is, drive the real Chrome (`mcp__claude-in-chrome__*`) and navigate directly
  to the Vite port from the logs, e.g. `http://localhost:5174/TaskTable/`.

## Drive it (things worth exercising)

- Add task (`+ Add task`), inline-rename a row, toggle the checkbox, add/remove
  tags via the `+` pill, drag a row by the grip to reorder.
- Task detail modal: the `⤢` button on each row (between checkbox and name)
  opens a name + description editor; Save commits, Cancel/empty-name discards.
- Manage tags, Sync (GitHub), Import/Export backup.

## Verify a change actually worked

Screenshot the flow you changed after driving it — don't stop at `tsc`. A clean
typecheck is not evidence the UI behaves.
