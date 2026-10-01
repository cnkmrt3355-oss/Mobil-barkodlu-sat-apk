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
  const expiry = (f.expiry || '').trim() || null;
  const fast = f.fast ? 1 : 0;
  const vat = f.vat === undefined || f.vat === '' ? 20 : int(f.vat, 'KDV oranı');
  if (id) {
    await tx([[`UPDATE products SET barcode=?,name=?,category_id=?,purchase_price=?,sale_price=?,minimum_stock=?,unit=?,expiry=?,fast=?,vat_rate=?,updated_at=${NOW} WHERE id=?`,
      [barcode, name, cat, buy, sell, min, f.unit || 'adet', expiry, fast, vat, id]]]);
  } else {
    const stock = int(f.stock, 'Stok');
    const set = [[`INSERT INTO products(barcode,name,category_id,purchase_price,sale_price,stock,minimum_stock,unit,expiry,fast,vat_rate,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,${NOW},${NOW})`,
      [barcode, name, cat, buy, sell, stock, min, f.unit || 'adet', expiry, fast, vat]]];
    if (stock > 0) set.push([`INSERT INTO stock_movements(product_id,type,quantity,previous_stock,new_stock,reason,created_at) VALUES((SELECT id FROM products WHERE barcode=?),'giris',?,0,?,'İlk stok',${NOW})`, [barcode, stock, stock]]);
    await tx(set);
  }
}
export const remove = (id) => tx([['DELETE FROM products WHERE id=?', [id]]]);

export async function catSave(name, id = null) {
  const n = name.trim();
  if (!n) throw new Error('Kategori adı boş olamaz');
  if ((await q('SELECT id FROM categories WHERE name=? AND id<>?', [n, id ?? 0])).length) throw new Error('Bu kategori zaten var');
  await tx([id ? ['UPDATE categories SET name=? WHERE id=?', [n, id]] : ['INSERT INTO categories(name) VALUES(?)', [n]]]);
}
export const catRemove = (id) => tx([['UPDATE products SET category_id=NULL WHERE category_id=?', [id]], ['DELETE FROM categories WHERE id=?', [id]]]);

export const fastList = () => q('SELECT * FROM products WHERE fast=1 ORDER BY name LIMIT 12');

// pct: örn. 10 -> %10 artış, -5 -> %5 azalış. categoryId null ise tüm ürünler.
export async function bulkPrice(categoryId, pct) {
  const mult = 1 + pct / 100;
  const rows = await q(`SELECT id,sale_price FROM products${categoryId ? ' WHERE category_id=?' : ''}`, categoryId ? [categoryId] : []);
  if (!rows.length) throw new Error('Güncellenecek ürün yok');
  await tx(rows.map((r) => [`UPDATE products SET sale_price=?,updated_at=${NOW} WHERE id=?`, [Math.max(0, Math.round(r.sale_price * mult)), r.id]]));
}
export async function bulkVat(categoryId, vat) {
  await tx([[`UPDATE products SET vat_rate=?,updated_at=${NOW}${categoryId ? ' WHERE category_id=?' : ''}`, categoryId ? [vat, categoryId] : [vat]]]);
}

// Yeni/ana format: her satır "Ürün Adı;Barkod;Fiyat;Stok" (taranan ürün listeleriyle aynı biçim). '#' ile başlayan satırlar yorum, atlanır.
// Eski format (geriye uyumluluk): barkod,ad,alış,satış,stok,min,birim,kategori (virgül veya TAB ile ayrılmış).
export async function importText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) throw new Error('İçe aktarılacak satır yok');
  const set = [], errors = [], seen = new Set();
  let ok = 0;
  lines.forEach((line, idx) => {
    const row = idx + 1;
    const semi = line.split(';').map((s) => s.trim());
    let barcode, name, buyRaw, saleRaw, stockRaw, minRaw, unit, catName;
    if (semi.length >= 4 && /^\d{6,14}$/.test(semi[1])) {
      // Ad;Barkod;Fiyat;Stok
      [name, barcode, saleRaw, stockRaw] = semi;
      buyRaw = '0'; minRaw = '5'; unit = 'adet'; catName = '';
    } else {
      [barcode, name, buyRaw, saleRaw, stockRaw, minRaw, unit, catName] = line.split(/\t|,/).map((s) => (s || '').trim());
    }
    if (!barcode || !/^\d+$/.test(barcode)) return errors.push(`Satır ${row}: barkod geçersiz`);
    if (!name) return errors.push(`Satır ${row}: ürün adı boş`);
    if (seen.has(barcode)) return errors.push(`Satır ${row}: barkod dosyada tekrar ediyor (${barcode})`);
    const sale = parseMoney(saleRaw || '');
    if (sale === null) return errors.push(`Satır ${row}: satış fiyatı geçersiz`);
    const buy = parseMoney(buyRaw || '0') ?? 0;
    const stock = /^\d+$/.test(stockRaw || '') ? Number(stockRaw) : 0;
    const min = /^\d+$/.test(minRaw || '') ? Number(minRaw) : 5;
    seen.add(barcode);
    if (catName) set.push(['INSERT OR IGNORE INTO categories(name) VALUES(?)', [catName]]);
    set.push([`INSERT INTO products(barcode,name,category_id,purchase_price,sale_price,stock,minimum_stock,unit,created_at,updated_at)
      VALUES(?,?,(SELECT id FROM categories WHERE name=?),?,?,?,?,?,${NOW},${NOW})
      ON CONFLICT(barcode) DO UPDATE SET name=excluded.name,category_id=excluded.category_id,purchase_price=excluded.purchase_price,
      sale_price=excluded.sale_price,stock=excluded.stock,minimum_stock=excluded.minimum_stock,unit=excluded.unit,updated_at=excluded.updated_at`,
      [barcode, name, catName || null, buy, sale, stock, min, unit || 'adet']]);
    ok++;
  });
  if (set.length) await tx(set);
  return { ok, errors };
}

// Tüm ürünleri "Ad;Barkod;Fiyat;Stok" biçiminde metne döker (csv=true ise virgülle ayrılır ve başlık satırı eklenir).
export async function exportText(csv = false) {
  const rows = await q('SELECT name,barcode,sale_price,stock FROM products ORDER BY name');
  const sep = csv ? ',' : ';';
  const field = (s) => (csv && /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : s);
  const lines = rows.map((r) => [field(r.name), r.barcode, (r.sale_price / 100).toFixed(2), r.stock].join(sep));
  const header = csv ? ['Ürün Adı', 'Barkod', 'Fiyat', 'Stok'].join(sep) : '# Format: Urun Adi;Barkod;Fiyat;Stok';
  return [header, ...lines].join('\n');
}

