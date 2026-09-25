export const MAX_CREDENTIAL_TUTORIAL_TITLE_LENGTH = 120;
export const MAX_CREDENTIAL_TUTORIAL_CONTENT_LENGTH = 12000;

export const DEFAULT_CREDENTIAL_TUTORIAL_TITLE = 'Cara Menggunakan Akun';

export interface ProductCredentialTutorial {
  credential_tutorial_enabled?: boolean;
  credential_tutorial_title?: string | null;
  credential_tutorial_content?: string | null;
}

export function getProductCredentialTutorial(product?: ProductCredentialTutorial | null) {
  if (product?.credential_tutorial_enabled !== true || !product.credential_tutorial_content?.trim()) {
    return null;
  }

  return {
    title: product.credential_tutorial_title?.trim() || DEFAULT_CREDENTIAL_TUTORIAL_TITLE,
    content: product.credential_tutorial_content,
  };
}

export function validateProductCredentialTutorial(data: Record<string, unknown>): string | null {
  if ('credential_tutorial_enabled' in data && typeof data.credential_tutorial_enabled !== 'boolean') {
    return 'Status tutorial pemakaian tidak valid';
  }

  for (const [key, label, maxLength] of [
    ['credential_tutorial_title', 'Judul tutorial', MAX_CREDENTIAL_TUTORIAL_TITLE_LENGTH],
    ['credential_tutorial_content', 'Isi tutorial', MAX_CREDENTIAL_TUTORIAL_CONTENT_LENGTH],
  ] as const) {
    if (!(key in data) || data[key] === null) continue;
    if (typeof data[key] !== 'string') return `${label} harus berupa teks`;
    if (data[key].length > maxLength) return `${label} maksimal ${maxLength} karakter`;
  }

  return null;
}
