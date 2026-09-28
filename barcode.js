import { byBarcode } from './products.js';
import { add } from './sales.js';

// Aşama 3'te gerçek kamera okuyucu buraya bağlanacak (Capacitor barkod eklentisi).
// Şimdilik null döner; arayüz barkod giriş alanını (elle / Bluetooth okuyucu) kullanır.
export async function scanBarcode() { return null; }

// barkod -> ürün ara -> bulunduysa sepete ekle. Bulunamazsa null.
export async function handleBarcode(code) {
  const c = String(code || '').trim();
  if (!c) throw new Error('Barkod boş');
  const p = await byBarcode(c);
  if (!p) return null;
  add(p);
  return p;
}
