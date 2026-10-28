-- Guests can read only the public card catalogue, approved reviews, and shared branding.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.cards, public.card_reviews, public.site_settings TO anon;

-- New tables created by the migration owner remain non-writable by guests by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
