import type { CSSProperties } from 'react';

const cache = new Map<string, CSSProperties>();

/** Parse a CSS declaration string ("a:b;c:d") into a React style object. */
export function css(str: string): CSSProperties {
  let obj = cache.get(str);
  if (obj) return obj;
  obj = {};
  for (const decl of str.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    (obj as Record<string, string>)[prop] = decl.slice(i + 1).trim();
  }
  cache.set(str, obj);
  return obj;
}
