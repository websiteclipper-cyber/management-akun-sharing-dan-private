/**
 * Normalize a WhatsApp number to digits-only international format.
 * Indonesian local numbers keep their existing convenience conversion,
 * while numbers that already include a country code (for example 60) are
 * preserved.
 */
export function normalizeWhatsAppPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const input = value.trim();
  if (!input || /[^\d\s()+.-]/.test(input)) return null;

  let phone = input.replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);

  if (phone.startsWith('0')) phone = `62${phone.slice(1)}`;
  else if (phone.startsWith('8')) phone = `62${phone}`;

  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

/**
 * Accept only canonical WhatsApp group invite links.
 * Invalid or unrelated URLs are never rendered as maintenance CTAs.
 */
export function normalizeWhatsAppGroupLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    const inviteCode = url.pathname.split('/').filter(Boolean)[0] || '';

    if (
      url.protocol !== 'https:'
      || url.hostname.toLowerCase() !== 'chat.whatsapp.com'
      || !/^[a-zA-Z0-9_-]+$/.test(inviteCode)
    ) {
      return null;
    }

    return `https://chat.whatsapp.com/${inviteCode}`;
  } catch {
    return null;
  }
}
