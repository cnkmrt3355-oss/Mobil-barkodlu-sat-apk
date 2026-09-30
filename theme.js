import { q, tx } from './database.js';

export async function get() {
  const r = (await q("SELECT value FROM settings WHERE key='theme'"))[0];
  return r?.value || 'system';
}
export async function set(v) {
  await tx([["INSERT INTO settings(key,value) VALUES('theme',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [v]]]);
  apply(v);
}
// 'system' ise data-theme özniteliği kaldırılır, cihazın kendi ayarına (prefers-color-scheme) bırakılır.
export function apply(v) {
  if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v;
  else delete document.documentElement.dataset.theme;
}
