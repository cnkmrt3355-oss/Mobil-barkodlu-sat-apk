// EAN-13 barkod SVG üretimi (standart GS1 kodlaması) ve raf etiketi paylaşımı.
const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R = L.map((s) => s.split('').map((c) => (c === '0' ? '1' : '0')).join(''));
const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

export function checkDigit(d12) {
  const s = String(d12).padStart(12, '0').slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}
// 8-13 haneli sayısal barkodu 13 haneye tamamlar (eksikse başa 0, kontrol basamağı gerekirse hesaplanır).
export function normalize(raw) {
  const s = String(raw || '').replace(/\D/g, '');
  if (!s || s.length > 13) return null;
  if (s.length === 13) return s;
  const d12 = s.padStart(12, '0');
  return d12 + checkDigit(d12);
}
function bits(code13) {
  const pattern = PARITY[Number(code13[0])];
  let b = '101';
  for (let i = 0; i < 6; i++) b += (pattern[i] === 'L' ? L : G)[Number(code13[1 + i])];
  b += '01010';
  for (let i = 0; i < 6; i++) b += R[Number(code13[7 + i])];
  return b + '101';
}
export function toSvg(rawCode, widthMm = 40, heightMm = 20) {
  const code = normalize(rawCode);
  if (!code) return '<p class="muted">Geçersiz barkod</p>';
  const b = bits(code), modW = widthMm / b.length;
  let bars = '', x = 0;
  for (const c of b) { if (c === '1') bars += `<rect x="${x.toFixed(2)}" y="0" width="${modW.toFixed(3)}" height="${(heightMm - 4).toFixed(2)}" fill="#000"/>`; x += modW; }
  return `<svg viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#fff">${bars}<text x="${widthMm / 2}" y="${heightMm - 0.5}" font-size="3" text-anchor="middle" font-family="monospace">${code}</text></svg>`;
}

function drawLabel(ctx, x, y, w, h, p) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.strokeStyle = '#ccc'; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#000'; ctx.textAlign = 'center';
      ctx.font = `${h * 0.11}px sans-serif`;
      ctx.fillText(String(p.name).slice(0, 24), x + w / 2, y + h * 0.15);
      ctx.drawImage(img, x + w * 0.05, y + h * 0.22, w * 0.9, h * 0.48);
      ctx.font = `bold ${h * 0.16}px sans-serif`;
      ctx.fillText((p.sale_price / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺', x + w / 2, y + h * 0.93);
      resolve();
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(toSvg(p.barcode, w, h * 0.5))));
  });
}

// qty adet etiketi bir sayfada (ızgara) PNG olarak üretir ve Android paylaşım menüsünü açar.
// Not: WebView'da yerleşik bir "yazdır" penceresi yoktur; görsel paylaşım menüsünden yazıcı uygulamasına gönderilir.
export async function shareLabelSheet(product, qty) {
  const P = window.Capacitor?.Plugins;
  if (!P?.Filesystem || !P?.Share) throw new Error('Dosya/paylaşım eklentisi bulunamadı');
  const cols = 2, wmm = 50, hmm = 25, gap = 3, px = 8;
  const rows = Math.ceil(qty / cols);
  const w = cols * wmm * px + (cols + 1) * gap * px, h = rows * hmm * px + (rows + 1) * gap * px;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < qty; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    await drawLabel(ctx, gap * px + c * (wmm + gap) * px, gap * px + r * (hmm + gap) * px, wmm * px, hmm * px, product);
  }
  const data = canvas.toDataURL('image/png').split(',')[1];
  const name = `etiket-${product.barcode}-${Date.now()}.png`;
  const { uri } = await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
  await P.Share.share({ title: name, url: uri });
}
