// Client-side helper for admin write operations
// All writes go through /api/admin/db which verifies JWT and uses service role

function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_token') || '';
}

async function adminFetch(body: Record<string, unknown>) {
  const token = getAdminToken();
  try {
    const res = await fetch('/api/admin/db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      // Normalize error shape: API returns { error: "string" } or { error: { message: "string" } }
      const errMsg = typeof json.error === 'string' ? json.error : json.error?.message || `HTTP ${res.status}`;
      return { error: { message: errMsg } };
    }
    return json;
  } catch (err) {
    return { error: { message: 'Gagal koneksi ke server: ' + (err as Error).message } };
  }
}

export async function adminInsert(table: string, data: Record<string, unknown> | Record<string, unknown>[]) {
  return adminFetch({ table, operation: 'insert', data });
}

export async function adminUpdate(
  table: string,
  data: Record<string, unknown>,
  match: Record<string, unknown>
) {
  return adminFetch({ table, operation: 'update', data, match });
}

export async function adminDelete(table: string, match: Record<string, unknown>) {
  return adminFetch({ table, operation: 'delete', match });
}

export async function adminSelect(
  table: string,
  select = '*',
  match?: Record<string, unknown>,
) {
  return adminFetch({ table, operation: 'select', select, match });
}

export async function adminRpc(rpc: string, rpcParams?: Record<string, unknown>) {
  return adminFetch({ rpc, rpcParams });
}
