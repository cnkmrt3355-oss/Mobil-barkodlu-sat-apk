import { q, tx } from './database.js';

const T = {
  categories: ['id', 'name'],
  products: ['id', 'barcode', 'name', 'category_id', 'purchase_price', 'sale_price', 'stock', 'minimum_stock', 'unit', 'created_at', 'updated_at'],
  sales: ['id', 'total_amount', 'discount', 'payment_type', 'created_at'],
  sale_items: ['id', 'sale_id', 'product_id', 'barcode', 'product_name', 'quantity', 'unit_price', 'total_price'],
  stock_movements: ['id', 'product_id', 'type', 'quantity', 'previous_stock', 'new_stock', 'reason', 'created_at'],
  settings: ['key', 'value'],
};

async function dump() {
  const d = { app: 'barkod-pos', version: 1, created: new Date().toISOString(), tables: {} };
  for (const t in T) d.tables[t] = await q(`SELECT ${T[t].join(',')} FROM ${t}`);
  return JSON.stringify(d);
}

// Yedeği JSON dosyası olarak oluşturur ve paylaşım menüsünü açar (Drive, WhatsApp, Dosyalar...).
export async function backup() {
  const P = window.Capacitor?.Plugins;
  if (!P?.Filesystem || !P?.Share) throw new Error('Dosya/paylaşım eklentisi bulunamadı');
  const name = `barkod-pos-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  const { uri } = await P.Filesystem.writeFile({ path: name, data: await dump(), directory: 'CACHE', encoding: 'utf8' });
  await P.Share.share({ title: name, url: uri });
}

// Önce dosya doğrulanır; silme + yükleme tek transaction'dır, hata olursa mevcut veri korunur.
export async function restore(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error('Yedek dosyası okunamadı'); }
  if (d?.app !== 'barkod-pos' || !d.tables) throw new Error('Geçerli bir yedek dosyası değil');
  for (const t in T) if (!Array.isArray(d.tables[t])) throw new Error(`Yedekte ${t} tablosu eksik`);
  const set = Object.keys(T).map((t) => [`DELETE FROM ${t}`]);
  for (const t in T) for (const r of d.tables[t]) set.push([`INSERT INTO ${t}(${T[t].join(',')}) VALUES(${T[t].map(() => '?').join(',')})`, T[t].map((c) => r[c] ?? null)]);
  set.push(["INSERT OR REPLACE INTO settings(key,value) VALUES('seeded','1')"]);
  await tx(set);
}
