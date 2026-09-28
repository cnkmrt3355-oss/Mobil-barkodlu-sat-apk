import { q, tx, NOW } from './database.js';

export const cart = [];
export const state = { discount: 0, notFound: null };

const find = (id) => cart.find((i) => i.id === id);
export function add(p) {
  const i = find(p.id);
  if ((i ? i.qty : 0) + 1 > p.stock) throw new Error(`Stok yetersiz (${p.stock} ${p.unit || 'adet'})`);
  if (i) i.qty++; else cart.push({ id: p.id, barcode: p.barcode, name: p.name, price: p.sale_price, qty: 1, stock: p.stock });
}
export function inc(id) { const i = find(id); if (i.qty + 1 > i.stock) throw new Error(`Stok yetersiz (${i.stock})`); i.qty++; }
export function dec(id) { const i = find(id); if (--i.qty <= 0) remove(id); }
export function remove(id) { cart.splice(cart.findIndex((i) => i.id === id), 1); }
export function clear() { cart.length = 0; state.discount = 0; }

export function totals() {
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return { sub, discount: state.discount, total: sub - state.discount };
}

export async function complete(payment) {
  if (!cart.length) throw new Error('Sepet boş');
  const t = totals();
  if (state.discount < 0 || state.discount > t.sub) throw new Error('İndirim geçersiz');
  for (const i of cart) { // güncel stok kontrolü
    const p = (await q('SELECT stock FROM products WHERE id=?', [i.id]))[0];
    if (!p) throw new Error(`${i.name} artık kayıtlı değil`);
    if (i.qty <= 0 || i.qty > p.stock) throw new Error(`${i.name}: stok yetersiz (${p.stock})`);
  }
  const set = [[`INSERT INTO sales(total_amount,discount,payment_type,created_at) VALUES(?,?,?,${NOW})`, [t.total, t.discount, payment]]];
  for (const i of cart) {
    set.push(['INSERT INTO sale_items(sale_id,product_id,barcode,product_name,quantity,unit_price,total_price) VALUES((SELECT MAX(id) FROM sales),?,?,?,?,?,?)', [i.id, i.barcode, i.name, i.qty, i.price, i.price * i.qty]]);
    set.push([`INSERT INTO stock_movements(product_id,type,quantity,previous_stock,new_stock,reason,created_at) VALUES(?,'cikis',?,(SELECT stock FROM products WHERE id=?),(SELECT stock FROM products WHERE id=?)-?,'Satış #'||(SELECT MAX(id) FROM sales),${NOW})`, [i.id, i.qty, i.id, i.id, i.qty]]);
    set.push([`UPDATE products SET stock=stock-?,updated_at=${NOW} WHERE id=?`, [i.qty, i.id]]);
  }
  await tx(set);
  clear();
}

export const history = () => q('SELECT s.*,(SELECT COALESCE(SUM(quantity),0) FROM sale_items WHERE sale_id=s.id) n FROM sales s ORDER BY id DESC LIMIT 100');
export const detail = async (id) => ({ sale: (await q('SELECT * FROM sales WHERE id=?', [id]))[0], items: await q('SELECT * FROM sale_items WHERE sale_id=?', [id]) });

export async function stats() {
  const [d] = await q("SELECT COALESCE(SUM(total_amount),0) t,COUNT(*) c FROM sales WHERE date(created_at)=date('now','localtime')");
  const [p] = await q('SELECT COUNT(*) n,COALESCE(SUM(stock<=minimum_stock),0) low FROM products');
  return { total: d.t, count: d.c, products: p.n, low: p.low };
}
