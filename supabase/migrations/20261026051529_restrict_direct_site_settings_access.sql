-- Site settings include internal flags and commission configuration.
-- Browsers use /api/public/settings, which returns an explicit public field list.
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.site_settings FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Allow public read site_settings" ON public.site_settings;
