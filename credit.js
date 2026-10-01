import { q, tx, NOW } from './database.js';

// Her müşteri için güncel bakiye: borç toplamı - tahsilat toplamı (kuruş, pozitif = müşteri borçlu).
export const list = () => q(`SELECT c.*,COALESCE((SELECT SUM(CASE WHEN type='borc' THEN amount ELSE -amount END) FROM credit_transactions WHERE customer_id=c.id),0) balance
  FROM customers c ORDER BY c.name`);
export const byId = async (id) => (await q('SELECT * FROM customers WHERE id=?', [id]))[0];
export const balance = async (id) => (await q(`SELECT COALESCE(SUM(CASE WHEN type='borc' THEN amount ELSE -amount END),0) b FROM credit_transactions WHERE customer_id=?`, [id]))[0].b;
export const history = (id) => q('SELECT * FROM credit_transactions WHERE customer_id=? ORDER BY id DESC LIMIT 200', [id]);

export async function add(name, phone) {
  const n = (name || '').trim();
  if (!n) throw new Error('Müşteri adı boş olamaz');
  await tx([[`INSERT INTO customers(name,phone,created_at) VALUES(?,?,${NOW})`, [n, (phone || '').trim() || null]]]);
}
export const remove = (id) => tx([['DELETE FROM credit_transactions WHERE customer_id=?', [id]], ['DELETE FROM customers WHERE id=?', [id]]]);

// type: 'borc' (elle borç ekle) | 'tahsilat' (ödeme alındı, bakiyeyi azaltır)
export async function transact(id, type, amount, description) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Tutar geçersiz');
  await tx([[`INSERT INTO credit_transactions(customer_id,type,description,amount,created_at) VALUES(?,?,?,?,${NOW})`,
    [id, type, description || (type === 'borc' ? 'Manuel borç' : 'Tahsilat'), amount]]]);
}
