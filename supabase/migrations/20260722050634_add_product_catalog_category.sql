alter table public.products
add column if not exists catalog_category text;

update public.products
set catalog_category = case
  when upper(platform_name) ~ '(CHATGPT|CLAUDE|GEMINI|GROK|LEONARDO|NOTION|LOVABLE|GOOGLE|DEEPSEEK|PERPLEXITY|MIDJOURNEY|CURSOR|COPILOT|BLACKBOX)'
    then 'ai_productivity'
  when upper(platform_name) ~ '(CANVA|CAPCUT|WINK|ADOBE|FIGMA|PICSART)'
    then 'editing_design'
  when upper(platform_name) ~ '(SPOTIFY|APPLE MUSIC|SOUNDCLOUD|TIDAL)'
    then 'music_audio'
  when upper(platform_name) ~ '(NETFLIX|YOUTUBE|DISNEY|VIDIO|VIU|PRIME|HBO|IQIYI|WE TV)'
    then 'streaming_entertainment'
  else 'other'
end
where catalog_category is null;

alter table public.products
alter column catalog_category set default 'other',
alter column catalog_category set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_catalog_category_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_catalog_category_check
    check (catalog_category in (
      'ai_productivity',
      'editing_design',
      'music_audio',
      'streaming_entertainment',
      'other'
    ));
  end if;
end $$;

comment on column public.products.catalog_category is
'Controls the catalog section where the product platform is displayed.';
