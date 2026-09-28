// SQLite (@capacitor-community/sqlite). Tarayıcı depolaması KULLANILMAZ.
const DB = 'pos';
export const NOW = "datetime('now','localtime')";

const plugin = () => {
  const p = window.Capacitor?.Plugins?.CapacitorSQLite;
  if (!p) throw new Error('SQLite eklentisi yok. Uygulamayı Android (Capacitor) üzerinde çalıştırın.');
  return p;
};

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE)',
  `CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,barcode TEXT NOT NULL UNIQUE,name TEXT NOT NULL,
    category_id INTEGER,purchase_price INTEGER NOT NULL DEFAULT 0,sale_price INTEGER NOT NULL DEFAULT 0,stock INTEGER NOT NULL DEFAULT 0,
    minimum_stock INTEGER NOT NULL DEFAULT 0,unit TEXT DEFAULT 'adet',created_at TEXT,updated_at TEXT)`,
  'CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY AUTOINCREMENT,total_amount INTEGER NOT NULL,discount INTEGER NOT NULL DEFAULT 0,payment_type TEXT,created_at TEXT)',
  `CREATE TABLE IF NOT EXISTS sale_items(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL,product_id INTEGER,barcode TEXT,
    product_name TEXT,quantity INTEGER NOT NULL,unit_price INTEGER NOT NULL,total_price INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS stock_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,type TEXT,quantity INTEGER,
    previous_stock INTEGER,new_stock INTEGER,reason TEXT,created_at TEXT)`,
  'CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT)',
  'CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)',
  'CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)',
];

export async function q(statement, values = []) {
  const r = await plugin().query({ database: DB, statement, values });
  return r.values || [];
}
// Tek transaction: [[sql, values], ...] — biri hata verirse hepsi geri alınır.
export const tx = (set) =>
  plugin().executeSet({ database: DB, transaction: true, set: set.map(([statement, values = []]) => ({ statement, values })) });

export async function init() {
  const p = plugin();
  try { await p.createConnection({ database: DB, version: 1, encrypted: false, mode: 'no-encryption', readonly: false }); } catch (e) { /* bağlantı zaten var */ }
  await p.open({ database: DB, readonly: false });
  await p.execute({ database: DB, transaction: true, statements: SCHEMA.join(';\n') });
  if (!(await q("SELECT 1 FROM settings WHERE key='seeded'")).length) await seed();
}

async function seed() {
  const set = ['Gıda', 'İçecek', 'Temizlik', 'Kişisel bakım', 'Atıştırmalık', 'Diğer'].map((n) => ['INSERT OR IGNORE INTO categories(name) VALUES(?)', [n]]);
  [['869000000001', 'Kola 330 ML', 2500, 20, 2], ['869000000002', 'Su 500 ML', 1000, 50, 2], ['869000000003', 'Çikolata', 2000, 30, 1]].forEach(([b, n, p, s, c]) =>
    set.push([`INSERT INTO products(barcode,name,category_id,purchase_price,sale_price,stock,minimum_stock,unit,created_at,updated_at) VALUES(?,?,?,0,?,?,5,'adet',${NOW},${NOW})`, [b, n, c, p, s]]));
  set.push(["INSERT INTO settings(key,value) VALUES('seeded','1')"]);
  await tx(set);
}
