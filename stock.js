import { q, tx, NOW } from './database.js';

export const list = () => q('SELECT id,name,stock,minimum_stock,unit FROM products ORDER BY (stock<=minimum_stock) DESC,name');
export const isLow = (p) => p.stock <= p.minimum_stock;

// delta: + giriş, - çıkış. Stok ve hareket kaydı tek transaction.
export async function adjust(id, delta, reason = 'Manuel düzenleme') {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Geçersiz miktar');
  const p = (await q('SELECT stock FROM products WHERE id=?', [id]))[0];
  if (!p) throw new Error('Ürün bulunamadı');
  const n = p.stock + delta;
  if (n < 0) throw new Error('Stok negatif olamaz');
  await tx([
    [`UPDATE products SET stock=?,updated_at=${NOW} WHERE id=?`, [n, id]],
    [`INSERT INTO stock_movements(product_id,type,quantity,previous_stock,new_stock,reason,created_at) VALUES(?,?,?,?,?,?,${NOW})`, [id, delta > 0 ? 'giris' : 'cikis', Math.abs(delta), p.stock, n, reason]],
  ]);
}
