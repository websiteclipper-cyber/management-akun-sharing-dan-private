type AssignmentRecord = Record<string, unknown>;

function asRecord(value: unknown): AssignmentRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as AssignmentRecord;
}

export function serializeBuyerAssignment(
  assignment: AssignmentRecord,
  now = Date.now(),
): AssignmentRecord {
  const relation = assignment.stock_account;
  const stockAccount = asRecord(Array.isArray(relation) ? relation[0] : relation);
  const expiresAt = typeof assignment.expired_at === 'string'
    ? Date.parse(assignment.expired_at)
    : Number.NaN;
  const credentialAvailable = assignment.status === 'active'
    && Number.isFinite(expiresAt)
    && expiresAt > now;

  if (!stockAccount) {
    return { ...assignment, credential_available: false, stock_account: null };
  }

  const { two_factor_secret_encrypted: twoFactorSecret, ...publicStockAccount } = stockAccount;
  return {
    ...assignment,
    credential_available: credentialAvailable,
    stock_account: credentialAvailable
      ? {
          ...publicStockAccount,
          has_two_factor_secret: Boolean(twoFactorSecret),
        }
      : {
          id: stockAccount.id,
          account_type: stockAccount.account_type,
        },
  };
}
