import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production (GitHub Pages) is served from /TaskTable/; the dev server serves
// from root so the in-app preview pane's proxy port (which opens at /) loads
// the app instead of a blank base-path mismatch.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/TaskTable/' : '/',
}));
