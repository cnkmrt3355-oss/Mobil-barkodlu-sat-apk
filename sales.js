import { q, tx, NOW } from './database.js';

export const cart = [];
export const state = { discount: 0, notFound: null, pay: 'Nakit', received: 0, customerId: null };

const find = (id) => cart.find((i) => i.id === id);
export function add(p) {
  const i = find(p.id);
  if ((i ? i.qty : 0) + 1 > p.stock) throw new Error(`Stok yetersiz (${p.stock} ${p.unit || 'adet'})`);
  if (i) i.qty++; else cart.push({ id: p.id, barcode: p.barcode, name: p.name, price: p.sale_price, qty: 1, stock: p.stock });
}
export function inc(id) { const i = find(id); if (i.qty + 1 > i.stock) throw new Error(`Stok yetersiz (${i.stock})`); i.qty++; }
export function dec(id) { const i = find(id); if (--i.qty <= 0) remove(id); }
export function remove(id) { cart.splice(cart.findIndex((i) => i.id === id), 1); }
export function clear() { cart.length = 0; state.discount = 0; state.received = 0; state.customerId = null; }

export function totals() {
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return { sub, discount: state.discount, total: sub - state.discount };
}

export async function complete(payment) {
  if (!cart.length) throw new Error('Sepet boş');
  const t = totals();
  if (state.discount < 0 || state.discount > t.sub) throw new Error('İndirim geçersiz');
  if (payment === 'Nakit' && state.received > 0 && state.received < t.total) throw new Error('Alınan para toplamdan az');
  if (payment === 'Veresiye' && !state.customerId) throw new Error('Veresiye için müşteri seçin');
  for (const i of cart) { // güncel stok kontrolü
    const p = (await q('SELECT stock FROM products WHERE id=?', [i.id]))[0];
    if (!p) throw new Error(`${i.name} artık kayıtlı değil`);
    if (i.qty <= 0 || i.qty > p.stock) throw new Error(`${i.name}: stok yetersiz (${p.stock})`);
  }
  const set = [[`INSERT INTO sales(total_amount,discount,payment_type,customer_id,created_at) VALUES(?,?,?,?,${NOW})`, [t.total, t.discount, payment, payment === 'Veresiye' ? state.customerId : null]]];
  for (const i of cart) {
    set.push(['INSERT INTO sale_items(sale_id,product_id,barcode,product_name,quantity,unit_price,total_price) VALUES((SELECT MAX(id) FROM sales),?,?,?,?,?,?)', [i.id, i.barcode, i.name, i.qty, i.price, i.price * i.qty]]);
    set.push([`INSERT INTO stock_movements(product_id,type,quantity,previous_stock,new_stock,reason,created_at) VALUES(?,'cikis',?,(SELECT stock FROM products WHERE id=?),(SELECT stock FROM products WHERE id=?)-?,'Satış #'||(SELECT MAX(id) FROM sales),${NOW})`, [i.id, i.qty, i.id, i.id, i.qty]]);
    set.push([`UPDATE products SET stock=stock-?,updated_at=${NOW} WHERE id=?`, [i.qty, i.id]]);
  }
  if (payment === 'Nakit') {
    set.push([`INSERT INTO cash_ledger(type,amount,description,sale_id,created_at) VALUES('giris',?,'Satış #'||(SELECT MAX(id) FROM sales),(SELECT MAX(id) FROM sales),${NOW})`, [t.total]]);
  } else if (payment === 'Veresiye') {
    set.push([`INSERT INTO credit_transactions(customer_id,type,description,amount,sale_id,created_at) VALUES(?,'borc','Satış #'||(SELECT MAX(id) FROM sales),?,(SELECT MAX(id) FROM sales),${NOW})`, [state.customerId, t.total]]);
  }
  const change = payment === 'Nakit' && state.received > t.total ? state.received - t.total : 0;
  await tx(set);
  const saleId = (await q('SELECT MAX(id) id FROM sales'))[0].id;
  clear();
  return { change, saleId };
}

export const history = () => q('SELECT s.*,(SELECT COALESCE(SUM(quantity),0) FROM sale_items WHERE sale_id=s.id) n FROM sales s ORDER BY id DESC LIMIT 100');
export const detail = async (id) => ({ sale: (await q('SELECT * FROM sales WHERE id=?', [id]))[0], items: await q('SELECT * FROM sale_items WHERE sale_id=?', [id]) });

export async function stats() {
  const [d] = await q("SELECT COALESCE(SUM(total_amount),0) t,COUNT(*) c FROM sales WHERE date(created_at)=date('now','localtime') AND status<>'iptal'");
  const [p] = await q('SELECT COUNT(*) n,COALESCE(SUM(stock<=minimum_stock),0) low FROM products');
  return { total: d.t, count: d.c, products: p.n, low: p.low };
}

const since = (d) => `date(s.created_at)>=date('now','localtime','-${Number(d)} days')`;
export async function report(days) {
  const [a] = await q(`SELECT COALESCE(SUM(total_amount),0) t,COUNT(*) c FROM sales s WHERE ${since(days)} AND s.status<>'iptal'`);
  const [b] = await q(`SELECT COALESCE(SUM(i.quantity),0) n FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${since(days)} AND s.status<>'iptal'`);
  return { total: a.t, count: a.c, items: b.n };
}
export const topProducts = () => q(`SELECT i.product_name name,SUM(i.quantity) n,SUM(i.total_price) t FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${since(29)} AND s.status<>'iptal' GROUP BY i.product_name ORDER BY n DESC LIMIT 5`);
export const worstProducts = () => q(`SELECT i.product_name name,SUM(i.quantity) n,SUM(i.total_price) t FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${since(29)} AND s.status<>'iptal' GROUP BY i.product_name HAVING n>0 ORDER BY n ASC LIMIT 5`);
export const revenue = async () => (await q("SELECT COALESCE(SUM(total_amount),0) t FROM sales WHERE status<>'iptal'"))[0].t;

// Son 30 gün kâr = (satış fiyatı - alış fiyatı) × adet; marj = kâr/ciro.
export async function profitReport(days) {
  const [r] = await q(`SELECT COALESCE(SUM((i.unit_price-COALESCE(p.purchase_price,0))*i.quantity),0) profit,COALESCE(SUM(i.total_price),0) rev
    FROM sale_items i JOIN sales s ON s.id=i.sale_id LEFT JOIN products p ON p.id=i.product_id WHERE ${since(days)} AND s.status<>'iptal'`);
  return { profit: r.profit, revenue: r.rev, margin: r.rev ? Math.round((r.profit / r.rev) * 1000) / 10 : 0 };
}
// 30 gündür hiç satılmamış, hâlâ stoklu ürünler.
export const deadStock = () => q(`SELECT p.* FROM products p WHERE p.stock>0 AND p.id NOT IN (
    SELECT DISTINCT i.product_id FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${since(29)} AND s.status<>'iptal' AND i.product_id IS NOT NULL
  ) ORDER BY p.name LIMIT 50`);

// Satışı iptal eder: stoğu geri ekler, hareket kaydı bırakır, nakit/veresiye kaydını ters çevirir. Satır silinmez (denetim izi kalır).
export async function voidSale(id) {
  const sale = (await q('SELECT * FROM sales WHERE id=?', [id]))[0];
  if (!sale) throw new Error('Satış bulunamadı');
  if (sale.status === 'iptal') throw new Error('Bu satış zaten iptal edilmiş');
  const items = await q('SELECT * FROM sale_items WHERE sale_id=?', [id]);
  const set = [];
  for (const i of items) {
    if (!i.product_id) continue;
    set.push([`INSERT INTO stock_movements(product_id,type,quantity,previous_stock,new_stock,reason,created_at) VALUES(?,'giris',?,(SELECT stock FROM products WHERE id=?),(SELECT stock FROM products WHERE id=?)+?,?,${NOW})`,
      [i.product_id, i.quantity, i.product_id, i.product_id, i.quantity, `İptal: Satış #${id}`]]);
    set.push([`UPDATE products SET stock=stock+?,updated_at=${NOW} WHERE id=?`, [i.quantity, i.product_id]]);
  }
  if (sale.payment_type === 'Nakit') {
    set.push([`INSERT INTO cash_ledger(type,amount,description,sale_id,created_at) VALUES('cikis',?,?,?,${NOW})`, [sale.total_amount, `İptal: Satış #${id}`, id]]);
  } else if (sale.payment_type === 'Veresiye' && sale.customer_id) {
    set.push([`INSERT INTO credit_transactions(customer_id,type,description,amount,sale_id,created_at) VALUES(?,'tahsilat',?,?,?,${NOW})`, [sale.customer_id, `İptal: Satış #${id}`, sale.total_amount, id]]);
  }
  set.push(["UPDATE sales SET status='iptal' WHERE id=?", [id]]);
  await tx(set);
}
