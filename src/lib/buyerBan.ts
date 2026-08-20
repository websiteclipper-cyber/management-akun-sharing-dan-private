export const BUYER_BANNED_STATUS = 'blocked';

export const BUYER_BAN_TITLE = 'Akun Anda Telah Dibanned';

export const BUYER_BAN_MESSAGE =
  'Akun Anda dibanned karena melanggar ketentuan yang telah dicantumkan pada deskripsi produk sebelum pembelian. Akses pembelian, pesanan, dan data akun dinonaktifkan sampai admin membuka kembali akun Anda.';

export function isBuyerBannedStatus(status: unknown): boolean {
  return status === BUYER_BANNED_STATUS;
}
