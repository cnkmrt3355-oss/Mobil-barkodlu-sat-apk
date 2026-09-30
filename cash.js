import { q, tx, NOW } from './database.js';

export const list = () => q('SELECT * FROM cash_ledger ORDER BY id DESC LIMIT 200');
export const balance = async () => (await q(`SELECT COALESCE(SUM(CASE WHEN type='giris' THEN amount ELSE -amount END),0) b FROM cash_ledger`))[0].b;

// type: 'giris' | 'cikis'. Nakit satışlarda giriş kaydı sales.js tarafından otomatik eklenir.
export async function add(type, amount, description) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Tutar geçersiz');
  await tx([[`INSERT INTO cash_ledger(type,amount,description,created_at) VALUES(?,?,?,${NOW})`, [type, amount, (description || '').trim() || (type === 'giris' ? 'Manuel giriş' : 'Manuel çıkış')]]]);
}
