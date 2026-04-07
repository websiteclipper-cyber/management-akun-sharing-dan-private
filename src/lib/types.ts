// ===== ENUMS =====
export type AdminRole = 'super_admin' | 'staff_admin';
export type AdminStatus = 'active' | 'inactive';
export type BuyerStatus = 'active' | 'blocked';
export type AccountType = 'sharing' | 'private';
export type ProductStatus = 'active' | 'inactive';
export type StockStatus = 'active' | 'full' | 'inactive' | 'suspended' | 'broken' | 'expired';
export type PaymentStatus = 'pending_payment' | 'paid' | 'failed' | 'refunded' | 'cancelled';
export type OrderStatus = 'pending' | 'paid' | 'assigned' | 'delivered' | 'completed' | 'cancelled' | 'refunded';
export type PaymentRecordStatus = 'pending' | 'success' | 'failed' | 'refunded';
export type AssignmentType = 'auto' | 'manual' | 'replacement';
export type AssignmentStatus = 'active' | 'expired' | 'replaced' | 'cancelled';
export type DeliveryChannel = 'web' | 'email' | 'whatsapp' | 'telegram';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ActorType = 'admin' | 'system';

// ===== ENTITIES =====
export interface Admin {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  status: AdminStatus;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Buyer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  status: BuyerStatus;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  platform_name: string;
  account_type: AccountType;
  price: number;
  duration_days: number;
  default_max_slot: number;
  description: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface StockAccount {
  id: number;
  product_id: number;
  account_identifier: string;
  account_secret_encrypted: string;
  profile_info: string | null;
  pin_info: string | null;
  notes_internal: string | null;
  account_type: AccountType;
  max_slot: number;
  current_used_slot: number;
  status: StockStatus;
  purchase_cost: number | null;
  acquired_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  product?: Product;
}

export interface Order {
  id: number;
  order_number: string;
  buyer_id: number;
  product_id: number;
  unit_price: number;
  total_amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  paid_at: string | null;
  delivered_at: string | null;
  discount_campaign_id: string | null;
  discount_amount: number;
  created_at: string;
  updated_at: string;
  // Joined
  buyer?: Buyer;
  product?: Product;
}

export interface Payment {
  id: number;
  order_id: number;
  gateway_name: string;
  gateway_reference: string | null;
  amount: number;
  status: PaymentRecordStatus;
  payload_raw: Record<string, unknown> | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountAssignment {
  id: number;
  order_id: number;
  stock_account_id: number;
  buyer_id: number;
  assigned_by_admin_id: number | null;
  assignment_type: AssignmentType;
  start_at: string;
  expired_at: string;
  status: AssignmentStatus;
  delivery_channel: DeliveryChannel;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  stock_account?: StockAccount;
  order?: Order;
  buyer?: Buyer;
}

export interface AccountReplacement {
  id: number;
  old_assignment_id: number;
  new_assignment_id: number;
  reason: string;
  replaced_by_admin_id: number;
  created_at: string;
}

export interface SupportTicket {
  id: number;
  buyer_id: number;
  order_id: number | null;
  subject: string;
  message: string;
  status: TicketStatus;
  handled_by_admin_id: number | null;
  created_at: string;
  updated_at: string;
  // Joined
  buyer?: Buyer;
  order?: Order;
}

export interface AuditLog {
  id: number;
  admin_id: number | null;
  actor_type: ActorType;
  action: string;
  entity_type: string;
  entity_id: number;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  // Joined
  admin?: Admin;
}

export interface Reseller {
  id: string;
  name: string;
  phone: string | null;
  ref_code: string;
  default_commission_type: 'fixed' | 'percentage';
  default_commission_value: number;
  status: 'active' | 'inactive';
  total_sales: number;
  total_commission: number;
  unpaid_commission: number;
  created_at: string;
  updated_at: string;
}

export interface ResellerProductCommission {
  id: string;
  reseller_id: string;
  product_id: number;
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
  created_at: string;
}

export interface ResellerCommission {
  id: string;
  reseller_id: string;
  order_id: string;
  product_id: number | null;
  product_name: string | null;
  order_amount: number;
  commission_type: 'fixed' | 'percentage';
  commission_rate: number;
  commission_amount: number;
  status: 'unpaid' | 'paid';
  paid_at: string | null;
  created_at: string;
}

// ===== Discount Campaigns =====
export type DiscountType = 'fixed' | 'percentage';

export interface DiscountCampaign {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  product_id: number | null;
  max_uses: number | null;
  current_uses: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  product?: Product;
}

// ===== Dashboard Stats =====
export interface DashboardStats {
  totalActiveProducts: number;
  totalStockAccountsActive: number;
  sharingAvailable: number;
  privateAvailable: number;
  fullAccounts: number;
  ordersToday: number;
  paidOrdersToday: number;
  failedAssignments: number;
  openSupportTickets: number;
}
