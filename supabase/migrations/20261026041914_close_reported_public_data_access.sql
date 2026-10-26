-- K-05: these five tables are accessed through server API routes only.
-- Catalog policies and all service_role privileges are unchanged.
REVOKE ALL PRIVILEGES ON TABLE public.reseller_commissions,
 public.reseller_product_commissions, public.account_replacements,
 public.payment_methods, public.warranty_claims FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Allow public read reseller_commissions" ON public.reseller_commissions;
DROP POLICY IF EXISTS "anon_select_commissions" ON public.reseller_commissions;
DROP POLICY IF EXISTS "auth_select_commissions" ON public.reseller_commissions;
DROP POLICY IF EXISTS "Allow public read reseller_product_commissions" ON public.reseller_product_commissions;
DROP POLICY IF EXISTS "anon_select_replacements" ON public.account_replacements;
DROP POLICY IF EXISTS "auth_select_replacements" ON public.account_replacements;
DROP POLICY IF EXISTS "anon_select_payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "auth_select_payment_methods" ON public.payment_methods;
