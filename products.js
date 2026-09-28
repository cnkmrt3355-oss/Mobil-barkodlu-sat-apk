import { q, tx, NOW } from './database.js';
import { parseMoney } from './ui.js';

export const list = (s = '') => { const k = `%${s.trim()}%`; return q('SELECT * FROM products WHERE name LIKE ? OR barcode LIKE ? ORDER BY name LIMIT 200', [k, k]); };
export const byBarcode = async (c) => (await q('SELECT * FROM products WHERE barcode=?', [String(c).trim()]))[0];
export const byId = async (id) => (await q('SELECT * FROM products WHERE id=?', [id]))[0];
export const categories = () => q('SELECT * FROM categories ORDER BY name');

const int = (v, ad) => { if (!/^\d+$/.test(String(v).trim())) throw new Error(`${ad} geçersiz (0 veya pozitif tam sayı)`); return Number(v); };

export async function save(f, id = null) {
  const name = f.name.trim(), barcode = f.barcode.trim();
  if (!name) throw new Error('Ürün adı boş olamaz');
  if (!barcode) throw new Error('Barkod boş olamaz');
  const buy = parseMoney(f.purchase), sell = parseMoney(f.sale);
  if (buy === null) throw new Error('Alış fiyatı geçersiz');
  if (sell === null) throw new Error('Satış fiyatı geçersiz');
  const min = int(f.min, 'Minimum stok');
  const dup = (await q('SELECT id FROM products WHERE barcode=?', [barcode]))[0];
  if (dup && dup.id !== id) throw new Error('Bu barkodla başka bir ürün var');
  const cat = f.category ? Number(f.category) : null;
  if (id) {
    await tx([[`UPDATE products SET barcode=?,name=?,category_id=?,purchase_price=?,sale_price=?,minimum_stock=?,unit=?,updated_at=${NOW} WHERE id=?`, [barcode, name, cat, buy, sell, min, f.unit || 'adet', id]]]);
  } else {
    const stock = int(f.stock, 'Stok');
    const set = [[`INSERT INTO products(barcode,name,category_id,purchase_price,sale_price,stock,minimum_stock,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,${NOW},${NOW})`, [barcode, name, cat, buy, sell, stock, min, f.unit || 'adet']]];
    if (stock > 0) set.push([`INSERT INTO stock_movements(product_id,type,quantity,previous_stock,new_stock,reason,created_at) VALUES((SELECT id FROM products WHERE barcode=?),'giris',?,0,?,'İlk stok',${NOW})`, [barcode, stock, stock]]);
    await tx(set);
  }
}
export const remove = (id) => tx([['DELETE FROM products WHERE id=?', [id]]]);
