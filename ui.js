export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (k) => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

// "12,50" -> 1250 (kuruş). Geçersiz/negatif -> null. Float kullanılmaz.
export function parseMoney(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [a, b = ''] = t.split('.');
  return Number(a) * 100 + Number((b + '00').slice(0, 2));
}
export const kuruşToInput = (k) => (k / 100).toFixed(2).replace('.', ',');

let timer;
export function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = err ? 'err' : ''; t.style.display = 'block';
  clearTimeout(timer); timer = setTimeout(() => (t.style.display = 'none'), 2500);
}
