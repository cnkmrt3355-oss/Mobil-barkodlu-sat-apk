import { q, tx, NOW } from './database.js';
import * as S from './sales.js';

export const list = () => q('SELECT * FROM held_sales ORDER BY id DESC');

// Mevcut sepeti "beklet" — daha sonra devam edilmek üzere kaydeder, ekrandaki sepeti boşaltır.
export async function hold(label) {
  if (!S.cart.length) throw new Error('Sepet boş');
  await tx([[`INSERT INTO held_sales(label,cart_json,discount,payment_type,customer_id,created_at) VALUES(?,?,?,?,?,${NOW})`,
    [label, JSON.stringify(S.cart), S.state.discount, S.state.pay, S.state.customerId]]]);
  S.clear();
}

// Bekletilen satışı sepete geri yükler. Sepette zaten ürün varsa kullanıcı onayı gerekir (çağıran taraf sorar).
export async function resume(id) {
  const h = (await q('SELECT * FROM held_sales WHERE id=?', [id]))[0];
  if (!h) throw new Error('Bekleyen satış bulunamadı');
  S.clear();
  JSON.parse(h.cart_json).forEach((i) => S.cart.push(i));
  S.state.discount = h.discount;
  S.state.pay = h.payment_type || 'Nakit';
  S.state.customerId = h.customer_id || null;
  await tx([['DELETE FROM held_sales WHERE id=?', [id]]]);
}

export const remove = (id) => tx([['DELETE FROM held_sales WHERE id=?', [id]]]);
