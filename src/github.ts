import type { GhConfig } from './types';

export function apiUrl(c: GhConfig): string {
  const path = c.path.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${path}`;
}

export function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** UTF-8-safe base64 decode of a GitHub contents-API payload. */
export function decodeContent(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
}

/** UTF-8-safe base64 encode for the GitHub contents API. */
export function encodeContent(data: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
}

/** Turn an opaque 404 from the contents API into an actionable message. */
export async function diagnose404(c: GhConfig, token: string): Promise<string> {
  try {
    const who = await fetch('https://api.github.com/user', { headers: ghHeaders(token), cache: 'no-store' });
    if (who.status === 401) return 'token is invalid or expired. Make a new one and reconnect.';
    const repo = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`,
      { headers: ghHeaders(token), cache: 'no-store' },
    );
    if (repo.status === 404)
      return `the token can’t see ${c.owner}/${c.repo}. Fix: on the token, set Repository access to include this repo, and Permissions → Contents = Read and write. (Or check owner/repo spelling.)`;
    if (repo.ok) {
      const info = await repo.json();
      if (info.permissions && !info.permissions.push)
        return `the token can read ${c.owner}/${c.repo} but can’t write. Fix: set the token’s Permissions → Contents = Read and write.`;
      const def = info.default_branch;
      if (def && def !== c.branch)
        return `the repo’s branch is “${def}”, not “${c.branch}”. Change the Branch field to “${def}” and try again.`;
      return `repo is reachable but the write was refused. Set the token’s Contents permission to Read and write, and confirm branch “${c.branch}” exists.`;
    }
  } catch {
    /* fall through to generic message */
  }
  return 'GitHub returned 404 — usually the token lacks Contents: Read and write for this repo, or owner/repo/branch is wrong.';
}
