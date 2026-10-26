CREATE TABLE public.reseller_login_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 ref_code text NOT NULL,
 ip_address text NOT NULL,
 attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reseller_login_attempts_ref_time_idx ON public.reseller_login_attempts (ref_code, attempted_at);
CREATE INDEX reseller_login_attempts_time_idx ON public.reseller_login_attempts (attempted_at);
ALTER TABLE public.reseller_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_login_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.reseller_login_attempts TO service_role;
GRANT USAGE ON SEQUENCE public.reseller_login_attempts_id_seq TO service_role;
