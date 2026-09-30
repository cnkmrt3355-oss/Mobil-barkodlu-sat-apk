import { init } from './database.js';
import * as P from './products.js';
import * as S from './sales.js';
import * as K from './stock.js';
import * as B from './backup.js';
import * as Held from './held.js';
import * as C from './credit.js';
import * as Cash from './cash.js';
import * as Labels from './labels.js';
import * as Theme from './theme.js';
import { handleBarcode, scanBarcode } from './barcode.js';
import { $, esc, money, parseMoney, kuruşToInput, toast } from './ui.js';

let view = 'home', arg = null, ready = false;
const NAV = [['home', '🏠', 'Ana Sayfa'], ['sales', '🛒', 'Satış'], ['products', '📦', 'Ürünler'], ['stock', '📊', 'Stok'], ['more', '☰', 'Daha Fazla']];
const TAB = { 'product-form': 'products', history: 'more', detail: 'more', reports: 'more', moves: 'more', cats: 'more',
  held: 'sales', receipt: 'sales', customers: 'more', 'customer-detail': 'more', cash: 'more', label: 'products', bulk: 'products', import: 'products', expiry: 'stock' };
const go = (v, a = null) => { view = v; arg = a; render(); };

const cartRow = (i) => `<div class="card item"><div><b>${esc(i.name)}</b><br><small>${money(i.price)}</small></div>
  <div class="qty"><button data-act="dec" data-id="${i.id}">−</button><b>${i.qty}</b><button data-act="inc" data-id="${i.id}">+</button></div>
  <div><b>${money(i.price * i.qty)}</b><br><button class="btn sm ghost" data-act="del" data-id="${i.id}">Sil</button></div></div>`;
const prodRow = (p, act) => `<div class="card item"><div><b>${esc(p.name)}</b><br><small>${esc(p.barcode)} · ${money(p.sale_price)} · stok ${p.stock}</small></div>${act}</div>`;

const views = {
  async home() {
    const s = await S.stats();
    return `<h1>Barkod POS</h1><div class="card hero"><small>Bugünkü satış</small><b>${money(s.total)}</b></div>
    ${s.low ? `<button class="card warn tile" style="width:100%" data-act="go" data-v="stock">⚠ ${s.low} ürünün stoğu kritik seviyede</button>` : ''}
    <button class="btn big" data-act="scan">📷 BARKOD OKUT</button>
    <div class="grid"><button class="card tile" data-act="go" data-v="sales">🛒 Satış</button><button class="card tile" data-act="go" data-v="products">📦 Ürünler</button>
    <button class="card tile" data-act="go" data-v="stock">📊 Stok</button><button class="card tile" data-act="go" data-v="history">🧾 Geçmiş</button></div>
    <div class="card"><div class="tot"><span>Bugünkü işlem</span><b>${s.count}</b></div><div class="tot"><span>Toplam ürün</span><b>${s.products}</b></div><div class="tot"><span>Düşük stok</span><b>${s.low}</b></div></div>`;
  },
  async sales() {
    const t = S.totals();
    const nf = S.state.notFound ? `<div class="card warn">Ürün bulunamadı: <b>${esc(S.state.notFound)}</b><br><button class="btn sm" data-act="newp">Yeni ürün ekle</button></div>` : '';
    const custs = S.state.pay === 'Veresiye' ? await C.list() : [];
    const fasts = await P.fastList();
    return `<h1>Satış</h1><button class="btn ghost sm" data-act="go" data-v="held">🕓 Bekleyen satışlar</button>
    ${fasts.length ? `<div class="grid" style="grid-template-columns:repeat(3,1fr)">${fasts.map((p) => `<button class="card tile" style="min-height:52px;font-size:.9rem" data-act="addid" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    <div class="row"><input id="bc" inputmode="numeric" placeholder="Barkod okut veya yaz" autocomplete="off"><button class="btn ghost" data-act="camscan">📷</button><button class="btn" data-act="addbc">Ekle</button></div>${nf}
    <input id="sq" type="search" placeholder="Ürün ara (ad veya barkod)"><div id="sr"></div>
    ${S.cart.length ? S.cart.map(cartRow).join('') : '<p class="muted">Sepet boş. Barkod okutun veya ürün arayın.</p>'}
    <div class="card"><div class="tot"><span>Ara toplam</span><b>${money(t.sub)}</b></div>
    <label for="disc">İndirim (₺)</label><input id="disc" inputmode="decimal" value="${t.discount ? kuruşToInput(t.discount) : ''}" placeholder="0,00">
    <div class="tot g"><span>GENEL TOPLAM</span><span>${money(t.total)}</span></div></div>
    <select id="pay">${['Nakit', 'Kart', 'Veresiye', 'Diğer'].map((o) => `<option ${o === S.state.pay ? 'selected' : ''}>${o}</option>`).join('')}</select>
    ${S.state.pay === 'Nakit' ? `<label for="rcv">Alınan para (₺)</label><input id="rcv" inputmode="decimal" value="${S.state.received ? kuruşToInput(S.state.received) : ''}" placeholder="0,00">${S.state.received >= t.total && S.state.received > 0 ? `<div class="card"><div class="tot g"><span>Para üstü</span><span>${money(S.state.received - t.total)}</span></div></div>` : ''}` : ''}
    ${S.state.pay === 'Veresiye' ? `<label for="cust">Müşteri</label><select id="cust"><option value="">Seçin</option>${custs.map((c) => `<option value="${c.id}" ${c.id === S.state.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button class="btn ghost sm" data-act="go" data-v="customers">+ Yeni müşteri</button>` : ''}
    ${S.cart.length ? `<button class="btn ghost" data-act="holdsale">⏸ Satışı beklet</button>` : ''}
    <button class="btn ok big" data-act="pay">SATIŞI TAMAMLA</button>`;
  },
  async products() {
    return `<h1>Ürünler</h1><button class="btn big" data-act="newp">+ Yeni ürün</button>
    <div class="row"><button class="btn ghost sm" data-act="go" data-v="bulk">⚙ Toplu güncelle</button><button class="btn ghost sm" data-act="go" data-v="import">📥 İçe aktar</button></div>
    <input id="ps" type="search" placeholder="Ürün ara"><div id="plist">${plist(await P.list())}</div>`;
  },
  async bulk() {
    const cats = await P.categories();
    return `<h1>Toplu Güncelleme</h1><label for="bcat">Kategori</label><select id="bcat"><option value="">Tüm ürünler</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    <h2>Satış fiyatı</h2><label for="bpct">Yüzde değişim (ör. 10 = +%10, -5 = -%5)</label><input id="bpct" inputmode="decimal" placeholder="10">
    <button class="btn big" data-act="bulkprice">Fiyatları güncelle</button>
    <h2>KDV oranı</h2><label for="bvat">Yeni KDV oranı (%)</label><input id="bvat" inputmode="numeric" placeholder="20">
    <button class="btn ghost big" data-act="bulkvat">KDV oranını uygula</button>
    <button class="btn ghost" data-act="go" data-v="products">Geri</button>`;
  },
  async import() {
    return `<h1>Ürün İçe/Dışa Aktar</h1>
    <h2>İçe Aktar</h2><p class="muted">Her satır: <b>Ürün Adı;Barkod;Fiyat;Stok</b> (taranan ürün listenizle aynı biçim). '#' ile başlayan satırlar yorum sayılır, atlanır. Barkod zaten kayıtlıysa ürün güncellenir.</p>
    <label for="impfile">.txt / .csv dosyasından yükle</label><input type="file" id="impfile" accept=".txt,.csv,text/plain,text/csv">
    <textarea id="imp" placeholder="Kızılay Elmalı maden suyu;8692813005611;20;0"></textarea>
    <button class="btn big" data-act="doimport">İçe Aktar</button>
    <h2>Dışa Aktar</h2><p class="muted">Tüm ürünleri aynı biçimde dosya olarak paylaşır (yedek almak veya başka bir cihaza taşımak için).</p>
    <div class="row"><button class="btn ghost" data-act="exporttxt">📤 TXT indir</button><button class="btn ghost" data-act="exportcsv">📤 CSV indir</button></div>
    <button class="btn ghost" data-act="go" data-v="products">Geri</button>`;
  },
  async 'product-form'() {
    const p = arg?.id ? await P.byId(arg.id) : null, cats = await P.categories();
    const v = p || { barcode: arg?.barcode || '', name: '', purchase_price: 0, sale_price: 0, stock: 0, minimum_stock: 5, unit: 'adet', category_id: 2 };
    const f = (id, l, val, extra = '') => `<label for="${id}">${l}</label><input id="${id}" value="${esc(val)}" ${extra}>`;
    return `<h1>${p ? 'Ürünü düzenle' : 'Yeni ürün'}</h1>
    <label for="f-barcode">Barkod</label><div class="row"><input id="f-barcode" value="${esc(v.barcode)}" inputmode="numeric"><button class="btn ghost" data-act="camscanform">📷</button></div>
    ${f('f-name', 'Ürün adı', v.name)}
    <label for="f-cat">Kategori</label><select id="f-cat">${cats.map((c) => `<option value="${c.id}" ${c.id === v.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    ${f('f-purchase', 'Alış fiyatı (₺)', kuruşToInput(v.purchase_price), 'inputmode="decimal"')}${f('f-sale', 'Satış fiyatı (₺)', kuruşToInput(v.sale_price), 'inputmode="decimal"')}
    ${f('f-stock', p ? 'Stok (Stok ekranından değişir)' : 'Stok', v.stock, `inputmode="numeric" ${p ? 'disabled' : ''}`)}${f('f-min', 'Minimum stok', v.minimum_stock, 'inputmode="numeric"')}${f('f-unit', 'Birim', v.unit)}
    ${f('f-vat', 'KDV oranı (%)', v.vat_rate ?? 20, 'inputmode="numeric"')}
    <label for="f-expiry">Son kullanma tarihi (isteğe bağlı)</label><input id="f-expiry" type="date" value="${esc(v.expiry || '')}">
    <label style="display:flex;align-items:center;gap:8px;margin:4px 0 12px"><input type="checkbox" id="f-fast" style="width:auto;min-height:auto;margin:0" ${v.fast ? 'checked' : ''}> Hızlı erişim listesine ekle</label>
    <button class="btn ok big" data-act="savep" data-id="${p?.id || ''}">Kaydet</button><button class="btn ghost" data-act="go" data-v="products">Vazgeç</button>`;
  },
  async stock() {
    const rows = await K.list();
    return `<h1>Stok</h1><div class="row"><button class="btn ghost sm" data-act="go" data-v="moves">📋 Hareketler</button><button class="btn ghost sm" data-act="go" data-v="expiry">⏳ Son kullanma tarihleri</button></div>${rows.map((p) => `<div class="card item"><div><b>${esc(p.name)}</b><br><small>Stok ${p.stock} ${esc(p.unit)} · min ${p.minimum_stock}</small></div>
      <div><span class="badge ${K.isLow(p) ? 'low' : ''}">${K.isLow(p) ? 'Düşük stok' : 'Normal'}</span><br><button class="btn sm ghost" data-act="adj" data-id="${p.id}">Stok girişi</button></div></div>`).join('') || '<p class="muted">Henüz ürün yok.</p>'}`;
  },
  async more() {
    const cur = await Theme.get();
    const label = cur === 'system' ? 'Sistem' : cur === 'light' ? 'Açık' : 'Koyu';
    const m = (v, l) => `<button class="btn ghost big" data-act="go" data-v="${v}">${l}</button>`;
    return `<h1>Daha Fazla</h1>${m('history', '🧾 Satış geçmişi')}${m('reports', '📈 Raporlar')}${m('moves', '📋 Stok hareketleri')}${m('cats', '🏷 Kategoriler')}${m('customers', '🤝 Veresiye')}${m('cash', '💵 Kasa Defteri')}${m('held', '🕓 Bekleyen Satışlar')}
    <h2>Görünüm</h2><button class="btn ghost big" data-act="theme">🌗 Tema: ${label}</button>
    <h2>Yedekleme</h2><button class="btn ghost big" data-act="backup">💾 Yedek oluştur</button><button class="btn ghost big" data-act="restore">♻️ Yedekten geri yükle</button><input type="file" id="rf" accept=".json,application/json" hidden>`;
  },
  async cats() {
    const c = await P.categories();
    return `<h1>Kategoriler</h1><div class="row"><input id="cn" placeholder="Yeni kategori"><button class="btn" data-act="cadd">Ekle</button></div>${c.map((x) => `<div class="card item"><b>${esc(x.name)}</b><div><button class="btn sm ghost" data-act="cren" data-id="${x.id}" data-n="${esc(x.name)}">Ad değiştir</button> <button class="btn sm bad" data-act="cdel" data-id="${x.id}">Sil</button></div></div>`).join('')}<button class="btn ghost" data-act="go" data-v="more">Geri</button>`;
  },
  async reports() {
    const d = await S.report(0), w = await S.report(6), m = await S.report(29), all = await S.revenue(), top = await S.topProducts(), worst = await S.worstProducts(), profit = await S.profitReport(29), dead = await S.deadStock();
    const c = (t, r) => `<div class="card"><h2>${t}</h2><div class="tot"><span>Ciro</span><b>${money(r.total)}</b></div><div class="tot"><span>İşlem</span><b>${r.count}</b></div><div class="tot"><span>Ürün adedi</span><b>${r.items}</b></div></div>`;
    return `<h1>Raporlar</h1>${c('Bugün', d)}${c('Son 7 gün', w)}${c('Son 30 gün', m)}<div class="card"><div class="tot"><span>Toplam ciro</span><b>${money(all)}</b></div></div>
    <div class="card"><h2>Kâr (son 30 gün)</h2><div class="tot"><span>Kâr</span><b>${money(profit.profit)}</b></div><div class="tot"><span>Kâr marjı</span><b>%${profit.margin}</b></div></div>
    <h2>En çok satanlar (30 gün)</h2>${top.map((x) => `<div class="card item"><b>${esc(x.name)}</b><span>${x.n} adet · ${money(x.t)}</span></div>`).join('') || '<p class="muted">Henüz satış yok.</p>'}
    <h2>En az satanlar (30 gün)</h2>${worst.map((x) => `<div class="card item"><b>${esc(x.name)}</b><span>${x.n} adet · ${money(x.t)}</span></div>`).join('') || '<p class="muted">Veri yok.</p>'}
    <h2>Ölü stok (30 gündür satılmayan)</h2>${dead.map((p) => `<div class="card item"><b>${esc(p.name)}</b><span>${p.stock} ${esc(p.unit)}</span></div>`).join('') || '<p class="muted">Yok.</p>'}`;
  },
  async moves() {
    const r = await K.movements();
    return `<h1>Stok hareketleri</h1>${r.map((x) => `<div class="card item"><div><b>${esc(x.name || '(silinmiş ürün)')}</b><br><small>${esc(x.reason)} · ${esc(x.created_at)}</small></div><div><b>${x.type === 'giris' ? '+' : '−'}${x.quantity}</b><br><small>${x.previous_stock} → ${x.new_stock}</small></div></div>`).join('') || '<p class="muted">Henüz hareket yok.</p>'}`;
  },
  async expiry() {
    const rows = await K.expiring(30);
    return `<h1>Son Kullanma Tarihleri</h1><p class="muted">Önümüzdeki 30 gün içinde sona erecek (veya geçmiş) ürünler.</p>
    ${rows.map((p) => `<div class="card item ${K.isExpired(p) ? 'warn' : ''}"><div><b>${esc(p.name)}</b><br><small>Stok ${p.stock} ${esc(p.unit)}</small></div><b>${esc(p.expiry)}${K.isExpired(p) ? ' (geçti)' : ''}</b></div>`).join('') || '<p class="muted">Yaklaşan SKT yok.</p>'}
    <button class="btn ghost" data-act="go" data-v="stock">Geri</button>`;
  },
  async history() {
    const rows = await S.history();
    return `<h1>Satış geçmişi</h1>${rows.map((s) => `<button class="card item" style="width:100%;text-align:left;font:inherit" data-act="detail" data-id="${s.id}"><div><b>#${s.id}</b> · ${esc(s.created_at)}<br><small>${s.n} ürün · ${esc(s.payment_type)}${s.status === 'iptal' ? ' · <b>İptal</b>' : ''}</small></div><b>${money(s.total_amount)}</b></button>`).join('') || '<p class="muted">Henüz satış yok.</p>'}`;
  },
  async detail() {
    const { sale, items } = await S.detail(arg);
    return `<h1>Satış #${sale.id}${sale.status === 'iptal' ? ' <span class="badge low">İptal</span>' : ''}</h1><p class="muted">${esc(sale.created_at)} · ${esc(sale.payment_type)}</p>${items.map((i) => `<div class="card item"><div><b>${esc(i.product_name)}</b><br><small>${i.quantity} × ${money(i.unit_price)}</small></div><b>${money(i.total_price)}</b></div>`).join('')}
    <div class="card"><div class="tot"><span>İndirim</span><b>${money(sale.discount)}</b></div><div class="tot g"><span>Toplam</span><span>${money(sale.total_amount)}</span></div></div>
    ${sale.status !== 'iptal' ? `<button class="btn bad" data-act="voidsale" data-id="${sale.id}">Satışı iptal et</button>` : ''}
    <button class="btn ghost" data-act="go" data-v="history">Geri</button>`;
  },
  async receipt() {
    const { sale, items } = await S.detail(arg);
    return `<h1>Fiş</h1><div class="card">${items.map((i) => `<div class="tot"><span>${esc(i.product_name)} × ${i.quantity}</span><b>${money(i.total_price)}</b></div>`).join('')}
    <div class="tot"><span>İndirim</span><b>${money(sale.discount)}</b></div><div class="tot g"><span>TOPLAM</span><span>${money(sale.total_amount)}</span></div>
    <p class="muted">${esc(sale.payment_type)} · ${esc(sale.created_at)}</p></div>
    <button class="btn big" data-act="sharereceipt" data-id="${sale.id}">📤 Paylaş / Yazdır</button>
    <button class="btn ghost big" data-act="go" data-v="sales">Yeni satış</button>`;
  },
  async held() {
    const rows = await Held.list();
    return `<h1>Bekleyen Satışlar</h1>${rows.map((h) => { const items = JSON.parse(h.cart_json); const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
      return `<div class="card item"><div><b>${esc(h.label)}</b><br><small>${items.length} ürün · ${esc(h.created_at)}</small></div>
      <div><b>${money(sub - h.discount)}</b><br><button class="btn sm" data-act="resume" data-id="${h.id}">Devam et</button> <button class="btn sm bad" data-act="delheld" data-id="${h.id}">Sil</button></div></div>`; }).join('') || '<p class="muted">Bekleyen satış yok.</p>'}
    <button class="btn ghost" data-act="go" data-v="sales">Geri</button>`;
  },
  async customers() {
    const rows = await C.list();
    return `<h1>Veresiye</h1><div class="row"><input id="cn2" placeholder="Müşteri adı"><input id="cp2" placeholder="Telefon" inputmode="tel"><button class="btn" data-act="cadd2">Ekle</button></div>
    ${rows.map((c) => `<button class="card item" style="width:100%;text-align:left;font:inherit" data-act="custdet" data-id="${c.id}"><div><b>${esc(c.name)}</b>${c.phone ? `<br><small>${esc(c.phone)}</small>` : ''}</div><b>${money(c.balance)}</b></button>`).join('') || '<p class="muted">Henüz müşteri yok.</p>'}
    <button class="btn ghost" data-act="go" data-v="more">Geri</button>`;
  },
  async 'customer-detail'() {
    const c = await C.byId(arg), hist = await C.history(arg), bal = await C.balance(arg);
    return `<h1>${esc(c.name)}</h1><div class="card hero"><small>Bakiye (borç)</small><b>${money(bal)}</b></div>
    <div class="row"><input id="ta" inputmode="decimal" placeholder="Tutar (₺)"><button class="btn" data-act="ctahsil" data-id="${c.id}">Tahsilat al</button></div>
    <div class="row"><input id="tb" inputmode="decimal" placeholder="Tutar (₺)"><button class="btn ghost" data-act="cborc" data-id="${c.id}">Borç ekle</button></div>
    ${hist.map((h) => `<div class="card item"><div><b>${h.type === 'borc' ? 'Borç' : 'Tahsilat'}</b><br><small>${esc(h.description || '')} · ${esc(h.created_at)}</small></div><b>${h.type === 'borc' ? '+' : '−'}${money(h.amount)}</b></div>`).join('') || '<p class="muted">Hareket yok.</p>'}
    <button class="btn bad" data-act="cdel2" data-id="${c.id}">Müşteriyi sil</button><button class="btn ghost" data-act="go" data-v="customers">Geri</button>`;
  },
  async cash() {
    const rows = await Cash.list(), bal = await Cash.balance();
    return `<h1>Kasa Defteri</h1><div class="card hero"><small>Kasa bakiyesi</small><b>${money(bal)}</b></div>
    <div class="row"><input id="cd" placeholder="Açıklama"><input id="ca" inputmode="decimal" placeholder="Tutar (₺)"></div>
    <div class="row"><button class="btn ok" data-act="cashin">Giriş</button><button class="btn bad" data-act="cashout">Çıkış</button></div>
    ${rows.map((r) => `<div class="card item"><div><b>${r.type === 'giris' ? 'Giriş' : 'Çıkış'}</b><br><small>${esc(r.description || '')} · ${esc(r.created_at)}</small></div><b>${r.type === 'giris' ? '+' : '−'}${money(r.amount)}</b></div>`).join('') || '<p class="muted">Henüz kayıt yok.</p>'}
    <button class="btn ghost" data-act="go" data-v="more">Geri</button>`;
  },
  async label() {
    const p = await P.byId(arg);
    if (!p) return '<p class="muted">Ürün bulunamadı.</p>';
    return `<h1>Raf Etiketi</h1><div class="card" style="text-align:center">${Labels.toSvg(p.barcode, 50, 24)}</div>
    <p><b>${esc(p.name)}</b><br>${money(p.sale_price)}</p>
    <label for="lq">Adet</label><input id="lq" inputmode="numeric" value="6">
    <button class="btn big" data-act="sharelabel" data-id="${p.id}">📤 Paylaş / Yazdır</button>
    <p class="muted">Android'de doğrudan yazdırma penceresi açılmaz; oluşturulan görsel paylaşım menüsünden yazıcı uygulamanıza veya bilgisayarınıza gönderilir.</p>
    <button class="btn ghost" data-act="go" data-v="products">Geri</button>`;
  },
};
const plist = (rows) => rows.map((p) => prodRow(p, `<div><button class="btn sm ghost" data-act="label" data-id="${p.id}">Etiket</button> <button class="btn sm ghost" data-act="edit" data-id="${p.id}">Düzenle</button> <button class="btn sm bad" data-act="delp" data-id="${p.id}">Sil</button></div>`)).join('') || '<p class="muted">Ürün bulunamadı.</p>';

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
  scan: async () => { go('sales'); await camScan(); },
  camscan: () => camScan(),
  addbc: () => addCode(val('bc')),
  addid: async (d) => { S.add(await P.byId(num(d))); render(); },
  inc: (d) => { S.inc(num(d)); render(); },
  dec: (d) => { S.dec(num(d)); render(); },
  del: (d) => { S.remove(num(d)); render(); },
  newp: () => { const b = S.state.notFound; S.state.notFound = null; go('product-form', { barcode: b }); },
  edit: (d) => go('product-form', { id: num(d) }),
  delp: async (d) => { if (confirm('Bu ürün silinsin mi?')) { await P.remove(num(d)); toast('Ürün silindi'); render(); } },
  savep: async (d) => {
    await P.save({ barcode: val('f-barcode'), name: val('f-name'), category: val('f-cat'), purchase: val('f-purchase'), sale: val('f-sale'), stock: val('f-stock'), min: val('f-min'), unit: val('f-unit'), expiry: val('f-expiry'), fast: $('#f-fast').checked, vat: val('f-vat') }, d.id ? Number(d.id) : null);
    toast('Ürün kaydedildi'); go('products');
  },
  adj: async (d) => {
    const n = prompt('Miktar (giriş için +, çıkış için −)'); if (n === null) return;
    await K.adjust(num(d), Number(n), 'Manuel stok düzenleme'); toast('Stok güncellendi'); render();
  },
  pay: async () => {
    const r = await S.complete(S.state.pay);
    toast(r.change ? `Satış tamamlandı. Para üstü: ${money(r.change)}` : 'Satış tamamlandı');
    go('receipt', r.saleId);
  },
  sharereceipt: async (d) => {
    const { sale, items } = await S.detail(num(d));
    const text = [`Fiş #${sale.id}`, sale.created_at, ...items.map((i) => `${i.product_name} x${i.quantity} = ${money(i.total_price)}`), `İndirim: ${money(sale.discount)}`, `TOPLAM: ${money(sale.total_amount)}`, `Ödeme: ${sale.payment_type}`].join('\n');
    const P2 = window.Capacitor?.Plugins;
    if (!P2?.Share) return toast('Paylaşım eklentisi bulunamadı', true);
    await P2.Share.share({ title: `Fiş #${sale.id}`, text });
  },
  holdsale: async () => {
    const label = prompt('Bu satış için bir etiket girin (ör. Kasa 2)', `Bekleyen #${Date.now() % 1000}`);
    if (label === null) return;
    await Held.hold(label.trim() || 'Bekleyen satış'); toast('Satış bekletildi'); render();
  },
  resume: async (d) => {
    if (S.cart.length && !confirm('Mevcut sepet silinip bu satış yüklenecek. Devam edilsin mi?')) return;
    await Held.resume(num(d)); toast('Satış yüklendi'); go('sales');
  },
  delheld: async (d) => { if (confirm('Bekleyen satış silinsin mi?')) { await Held.remove(num(d)); render(); } },
  cadd2: async () => { await C.add(val('cn2'), val('cp2')); render(); },
  custdet: (d) => go('customer-detail', num(d)),
  ctahsil: async (d) => {
    const amt = parseMoney(val('ta')); if (amt === null || amt <= 0) throw new Error('Tutar geçersiz');
    await C.transact(num(d), 'tahsilat', amt); toast('Tahsilat kaydedildi'); go('customer-detail', num(d));
  },
  cborc: async (d) => {
    const amt = parseMoney(val('tb')); if (amt === null || amt <= 0) throw new Error('Tutar geçersiz');
    await C.transact(num(d), 'borc', amt); toast('Borç eklendi'); go('customer-detail', num(d));
  },
  cdel2: async (d) => { if (confirm('Müşteri ve tüm hareketleri silinsin mi?')) { await C.remove(num(d)); toast('Müşteri silindi'); go('customers'); } },
  cashin: async () => {
    const amt = parseMoney(val('ca')); if (amt === null || amt <= 0) throw new Error('Tutar geçersiz');
    await Cash.add('giris', amt, val('cd')); render();
  },
  cashout: async () => {
    const amt = parseMoney(val('ca')); if (amt === null || amt <= 0) throw new Error('Tutar geçersiz');
    await Cash.add('cikis', amt, val('cd')); render();
  },
  label: (d) => go('label', num(d)),
  sharelabel: async (d) => {
    const p = await P.byId(num(d));
    const qty = Math.max(1, Math.min(60, Number(val('lq')) || 1));
    await Labels.shareLabelSheet(p, qty); toast('Etiket paylaşıma hazırlandı');
  },
  detail: (d) => go('detail', num(d)),
  cadd: async () => { await P.catSave(val('cn')); render(); },
  cren: async (d) => { const n = prompt('Kategori adı', d.n); if (n === null) return; await P.catSave(n, num(d)); render(); },
  cdel: async (d) => { if (confirm('Kategori silinsin mi? Ürünler kategorisiz kalır.')) { await P.catRemove(num(d)); render(); } },
  backup: () => B.backup(),
  restore: () => $('#rf').click(),
  bulkprice: async () => {
    const pct = Number(val('bpct')); if (!pct) throw new Error('Yüzde değeri girin');
    const cat = val('bcat') ? Number(val('bcat')) : null;
    if (!confirm(`${cat ? 'Seçili kategorideki' : 'TÜM'} ürünlerin satış fiyatı %${pct > 0 ? '+' : ''}${pct} değişecek. Onaylıyor musunuz?`)) return;
    await P.bulkPrice(cat, pct); toast('Fiyatlar güncellendi');
  },
  bulkvat: async () => {
    const vat = Number(val('bvat')); if (!Number.isInteger(vat) || vat < 0) throw new Error('KDV oranı geçersiz');
    const cat = val('bcat') ? Number(val('bcat')) : null;
    if (!confirm(`${cat ? 'Seçili kategorideki' : 'TÜM'} ürünlerin KDV oranı %${vat} olacak. Onaylıyor musunuz?`)) return;
    await P.bulkVat(cat, vat); toast('KDV oranı güncellendi');
  },
  doimport: async () => {
    const r = await P.importText(val('imp'));
    toast(r.errors.length ? `${r.ok} ürün eklendi/güncellendi, ${r.errors.length} satır hatalı` : `${r.ok} ürün eklendi/güncellendi`, r.errors.length > 0 && r.ok === 0);
    if (r.errors.length) alert(r.errors.slice(0, 15).join('\n'));
    if (r.ok) go('products');
  },
  exporttxt: () => exportProducts('txt'),
  exportcsv: () => exportProducts('csv'),
  camscanform: async () => {
    const c = await scanBarcode();
    if (c) $('#f-barcode').value = c;
  },
  theme: async () => {
    const cur = await Theme.get();
    const next = cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system';
    await Theme.set(next); render();
  },
  voidsale: async (d) => {
    if (!confirm('Bu satış iptal edilsin mi? Stok geri eklenir, nakit/veresiye kaydı ters çevrilir.')) return;
    await S.voidSale(num(d)); toast('Satış iptal edildi'); render();
  },
};
async function exportProducts(fmt) {
  const P2 = window.Capacitor?.Plugins;
  if (!P2?.Filesystem || !P2?.Share) return toast('Dosya/paylaşım eklentisi bulunamadı', true);
  const text = await P.exportText(fmt === 'csv');
  const name = `urunler-${new Date().toISOString().slice(0, 10)}.${fmt}`;
  const { uri } = await P2.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
  await P2.Share.share({ title: name, url: uri });
}
async function doRestore(f) {
  if (!f) return;
  const text = await f.text();
  if (!confirm('Mevcut TÜM veriler silinip yedekteki verilerle değiştirilecek. Bu işlem geri alınamaz. Devam edilsin mi?')) return;
  await B.restore(text); toast('Yedek geri yüklendi'); go('home');
}
async function camScan() { const c = await scanBarcode(); if (c) await addCode(c); }
async function addCode(c) {
  S.state.notFound = null;
  const p = await handleBarcode(c);
  if (!p) S.state.notFound = String(c).trim();
  render();
}

const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
document.addEventListener('click', guard((e) => { const t = e.target.closest('[data-act]'); if (t) return act[t.dataset.act]?.(t.dataset); }));
document.addEventListener('keydown', guard((e) => { if (e.key === 'Enter' && e.target.id === 'bc') return addCode(e.target.value); }));
document.addEventListener('change', guard(async (e) => {
  if (e.target.id === 'impfile') {
    const f = e.target.files[0]; e.target.value = '';
    if (f) $('#imp').value = await f.text();
    return;
  }
  if (e.target.id === 'pay') { S.state.pay = e.target.value; return render(); }
  if (e.target.id === 'cust') { S.state.customerId = e.target.value ? Number(e.target.value) : null; return; }
  if (e.target.id === 'rcv') {
    const v = e.target.value.trim() === '' ? 0 : parseMoney(e.target.value);
    if (v === null) { toast('Tutar geçersiz', true); S.state.received = 0; } else S.state.received = v;
    return render();
  }
  if (e.target.id === 'rf') { const f = e.target.files[0]; e.target.value = ''; return doRestore(f); }
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
  try {
    await init();
    Theme.apply(await Theme.get());
    ready = true; render();
  } catch (e) { $('#view').innerHTML = `<div class="card warn"><b>Veritabanı açılamadı</b><br>${esc(e.message)}</div>`; }
})();
