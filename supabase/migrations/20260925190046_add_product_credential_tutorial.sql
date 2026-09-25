-- Tutorials belong to the purchased product; leave existing products blank
-- until the admin writes instructions that match that product.
alter table public.products
  add column credential_tutorial_enabled boolean not null default true,
  add column credential_tutorial_title text,
  add column credential_tutorial_content text,
  add constraint products_credential_tutorial_title_length
    check (char_length(credential_tutorial_title) <= 120),
  add constraint products_credential_tutorial_content_length
    check (char_length(credential_tutorial_content) <= 12000);

comment on column public.products.credential_tutorial_content is
  'Product-specific Markdown instructions shown with delivered account credentials.';

notify pgrst, 'reload schema';
