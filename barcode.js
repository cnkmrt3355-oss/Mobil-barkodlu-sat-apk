import { byBarcode } from './products.js';
import { add } from './sales.js';

// Kamera ile barkod okur (@capacitor-mlkit/barcode-scanning). Okunan değeri döner; iptalde null.
export async function scanBarcode() {
  const B = window.Capacitor?.Plugins?.BarcodeScanner;
  if (!B) throw new Error('Kamera eklentisi bulunamadı (yalnızca Android uygulamasında çalışır)');
  const perm = await B.requestPermissions();
  if (perm.camera !== 'granted' && perm.camera !== 'limited') throw new Error('Kamera izni verilmedi');
  try {
    if (!(await B.isGoogleBarcodeScannerModuleAvailable()).available) {
      await B.installGoogleBarcodeScannerModule();
      throw new Error('Tarayıcı modülü indiriliyor, birkaç saniye sonra tekrar deneyin');
    }
  } catch (e) { if (/indiriliyor/.test(e.message)) throw e; }
  try {
    const { barcodes } = await B.scan();
    return barcodes?.[0]?.rawValue || null;
  } catch (e) {
    if (/cancel/i.test(e.message || '')) return null;
    throw e;
  }
}

// barkod -> ürün ara -> bulunduysa sepete ekle. Bulunamazsa null.
export async function handleBarcode(code) {
  const c = String(code || '').trim();
  if (!c) throw new Error('Barkod boş');
  const p = await byBarcode(c);
  if (!p) return null;
  add(p);
  return p;
}
