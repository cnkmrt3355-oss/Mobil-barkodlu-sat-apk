import { init } from './database.js';
import * as P from './products.js';
import * as S from './sales.js';
import * as K from './stock.js';
import { handleBarcode, scanBarcode } from './barcode.js';
import { $, esc, money, parseMoney, kuruşToInput, toast } from './ui.js';

let view = 'home', arg = null, ready = false;
const NAV = [['home', '🏠', 'Ana Sayfa'], ['sales', '🛒', 'Satış'], ['products', '📦', 'Ürünler'], ['stock', '📊', 'Stok'], ['more', '☰', 'Daha Fazla']];
const TAB = { 'product-form': 'products', history: 'more', detail: 'more' };
const go = (v, a = null) => { view = v; arg = a; render(); };

const cartRow = (i) => `<div class="card item"><div><b>${esc(i.name)}</b><br><small>${money(i.price)}</small></div>
  <div class="qty"><button data-act="dec" data-id="${i.id}">−</button><b>${i.qty}</b><button data-act="inc" data-id="${i.id}">+</button></div>
  <div><b>${money(i.price * i.qty)}</b><br><button class="btn sm ghost" data-act="del" data-id="${i.id}">Sil</button></div></div>`;
const prodRow = (p, act) => `<div class="card item"><div><b>${esc(p.name)}</b><br><small>${esc(p.barcode)} · ${money(p.sale_price)} · stok ${p.stock}</small></div>${act}</div>`;

const views = {
  async home() {
    const s = await S.stats();
    return `<h1>Barkod POS</h1><div class="card hero"><small>Bugünkü satış</small><b>${money(s.total)}</b></div>
    <button class="btn big" data-act="scan">📷 BARKOD OKUT</button>
    <div class="grid"><button class="card tile" data-act="go" data-v="sales">🛒 Satış</button><button class="card tile" data-act="go" data-v="products">📦 Ürünler</button>
    <button class="card tile" data-act="go" data-v="stock">📊 Stok</button><button class="card tile" data-act="go" data-v="history">🧾 Geçmiş</button></div>
    <div class="card"><div class="tot"><span>Bugünkü işlem</span><b>${s.count}</b></div><div class="tot"><span>Toplam ürün</span><b>${s.products}</b></div><div class="tot"><span>Düşük stok</span><b>${s.low}</b></div></div>`;
  },
  async sales() {
    const t = S.totals();
    const nf = S.state.notFound ? `<div class="card warn">Ürün bulunamadı: <b>${esc(S.state.notFound)}</b><br><button class="btn sm" data-act="newp">Yeni ürün ekle</button></div>` : '';
    return `<h1>Satış</h1><div class="row"><input id="bc" inputmode="numeric" placeholder="Barkod okut veya yaz" autocomplete="off"><button class="btn" data-act="addbc">Ekle</button></div>${nf}
    <input id="sq" type="search" placeholder="Ürün ara (ad veya barkod)"><div id="sr"></div>
    ${S.cart.length ? S.cart.map(cartRow).join('') : '<p class="muted">Sepet boş. Barkod okutun veya ürün arayın.</p>'}
    <div class="card"><div class="tot"><span>Ara toplam</span><b>${money(t.sub)}</b></div>
    <label for="disc">İndirim (₺)</label><input id="disc" inputmode="decimal" value="${t.discount ? kuruşToInput(t.discount) : ''}" placeholder="0,00">
    <div class="tot g"><span>GENEL TOPLAM</span><span>${money(t.total)}</span></div></div>
    <select id="pay"><option>Nakit</option><option>Kart</option><option>Diğer</option></select>
    <button class="btn ok big" data-act="pay">SATIŞI TAMAMLA</button>`;
  },
  async products() {
    return `<h1>Ürünler</h1><button class="btn big" data-act="newp">+ Yeni ürün</button><input id="ps" type="search" placeholder="Ürün ara"><div id="plist">${plist(await P.list())}</div>`;
  },
  async 'product-form'() {
    const p = arg?.id ? await P.byId(arg.id) : null, cats = await P.categories();
    const v = p || { barcode: arg?.barcode || '', name: '', purchase_price: 0, sale_price: 0, stock: 0, minimum_stock: 5, unit: 'adet', category_id: 2 };
    const f = (id, l, val, extra = '') => `<label for="${id}">${l}</label><input id="${id}" value="${esc(val)}" ${extra}>`;
    return `<h1>${p ? 'Ürünü düzenle' : 'Yeni ürün'}</h1>${f('f-barcode', 'Barkod', v.barcode, 'inputmode="numeric"')}${f('f-name', 'Ürün adı', v.name)}
    <label for="f-cat">Kategori</label><select id="f-cat">${cats.map((c) => `<option value="${c.id}" ${c.id === v.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    ${f('f-purchase', 'Alış fiyatı (₺)', kuruşToInput(v.purchase_price), 'inputmode="decimal"')}${f('f-sale', 'Satış fiyatı (₺)', kuruşToInput(v.sale_price), 'inputmode="decimal"')}
    ${f('f-stock', p ? 'Stok (Stok ekranından değişir)' : 'Stok', v.stock, `inputmode="numeric" ${p ? 'disabled' : ''}`)}${f('f-min', 'Minimum stok', v.minimum_stock, 'inputmode="numeric"')}${f('f-unit', 'Birim', v.unit)}
    <button class="btn ok big" data-act="savep" data-id="${p?.id || ''}">Kaydet</button><button class="btn ghost" data-act="go" data-v="products">Vazgeç</button>`;
  },
  async stock() {
    const rows = await K.list();
    return `<h1>Stok</h1>${rows.map((p) => `<div class="card item"><div><b>${esc(p.name)}</b><br><small>Stok ${p.stock} ${esc(p.unit)} · min ${p.minimum_stock}</small></div>
      <div><span class="badge ${K.isLow(p) ? 'low' : ''}">${K.isLow(p) ? 'Düşük stok' : 'Normal'}</span><br><button class="btn sm ghost" data-act="adj" data-id="${p.id}">Stok girişi</button></div></div>`).join('') || '<p class="muted">Henüz ürün yok.</p>'}`;
  },
  async more() { return `<h1>Daha Fazla</h1><button class="btn big" data-act="go" data-v="history">🧾 Satış geçmişi</button><p class="muted">Raporlar, ayarlar ve yedekleme sonraki aşamalarda eklenecek.</p>`; },
  async history() {
    const rows = await S.history();
    return `<h1>Satış geçmişi</h1>${rows.map((s) => `<button class="card item" style="width:100%;text-align:left;font:inherit" data-act="detail" data-id="${s.id}"><div><b>#${s.id}</b> · ${esc(s.created_at)}<br><small>${s.n} ürün · ${esc(s.payment_type)}</small></div><b>${money(s.total_amount)}</b></button>`).join('') || '<p class="muted">Henüz satış yok.</p>'}`;
  },
  async detail() {
    const { sale, items } = await S.detail(arg);
    return `<h1>Satış #${sale.id}</h1><p class="muted">${esc(sale.created_at)} · ${esc(sale.payment_type)}</p>${items.map((i) => `<div class="card item"><div><b>${esc(i.product_name)}</b><br><small>${i.quantity} × ${money(i.unit_price)}</small></div><b>${money(i.total_price)}</b></div>`).join('')}
    <div class="card"><div class="tot"><span>İndirim</span><b>${money(sale.discount)}</b></div><div class="tot g"><span>Toplam</span><span>${money(sale.total_amount)}</span></div></div><button class="btn ghost" data-act="go" data-v="history">Geri</button>`;
  },
};
const plist = (rows) => rows.map((p) => prodRow(p, `<div><button class="btn sm ghost" data-act="edit" data-id="${p.id}">Düzenle</button> <button class="btn sm bad" data-act="delp" data-id="${p.id}">Sil</button></div>`)).join('') || '<p class="muted">Ürün bulunamadı.</p>';

async function render() {
  if (!ready) return;
  const on = TAB[view] || view;
  $('#nav').innerHTML = NAV.map(([v, i, l]) => `<button data-act="go" data-v="${v}" class="${v === on ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('');
  try { $('#view').innerHTML = await views[view](); } catch (e) { toast(e.message, true); }
  if (view === 'sales') $('#bc')?.focus();
}

const val = (id) => $('#' + id).value;
const num = (d) => Number(d.id);
const act = {
  go: (d) => { S.state.notFound = null; go(d.v); },
  scan: async () => { go('sales'); const c = await scanBarcode(); if (c) await addCode(c); },
  addbc: () => addCode(val('bc')),
  addid: async (d) => { S.add(await P.byId(num(d))); render(); },
  inc: (d) => { S.inc(num(d)); render(); },
  dec: (d) => { S.dec(num(d)); render(); },
  del: (d) => { S.remove(num(d)); render(); },
  newp: () => { const b = S.state.notFound; S.state.notFound = null; go('product-form', { barcode: b }); },
  edit: (d) => go('product-form', { id: num(d) }),
  delp: async (d) => { if (confirm('Bu ürün silinsin mi?')) { await P.remove(num(d)); toast('Ürün silindi'); render(); } },
  savep: async (d) => {
    await P.save({ barcode: val('f-barcode'), name: val('f-name'), category: val('f-cat'), purchase: val('f-purchase'), sale: val('f-sale'), stock: val('f-stock'), min: val('f-min'), unit: val('f-unit') }, d.id ? Number(d.id) : null);
    toast('Ürün kaydedildi'); go('products');
  },
  adj: async (d) => {
    const n = prompt('Miktar (giriş için +, çıkış için −)'); if (n === null) return;
    await K.adjust(num(d), Number(n), 'Manuel stok düzenleme'); toast('Stok güncellendi'); render();
  },
  pay: async () => {
    await S.complete(val('pay')); toast('Satış tamamlandı'); render();
  },
  detail: (d) => go('detail', num(d)),
};
async function addCode(c) {
  S.state.notFound = null;
  const p = await handleBarcode(c);
  if (!p) S.state.notFound = String(c).trim();
  render();
}

const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
document.addEventListener('click', guard((e) => { const t = e.target.closest('[data-act]'); if (t) return act[t.dataset.act]?.(t.dataset); }));
document.addEventListener('keydown', guard((e) => { if (e.key === 'Enter' && e.target.id === 'bc') return addCode(e.target.value); }));
document.addEventListener('change', guard((e) => {
  if (e.target.id !== 'disc') return;
  const v = e.target.value.trim() === '' ? 0 : parseMoney(e.target.value);
  if (v === null) { toast('İndirim geçersiz', true); e.target.value = ''; S.state.discount = 0; } else S.state.discount = v;
  render();
}));
document.addEventListener('input', guard(async (e) => {
  if (e.target.id === 'sq') {
    const k = e.target.value.trim();
    $('#sr').innerHTML = k ? (await P.list(k)).slice(0, 8).map((p) => prodRow(p, `<button class="btn sm" data-act="addid" data-id="${p.id}">Ekle</button>`)).join('') : '';
  } else if (e.target.id === 'ps') $('#plist').innerHTML = plist(await P.list(e.target.value));
}));

(async () => {
  try { await init(); ready = true; render(); } catch (e) { $('#view').innerHTML = `<div class="card warn"><b>Veritabanı açılamadı</b><br>${esc(e.message)}</div>`; }
})();
