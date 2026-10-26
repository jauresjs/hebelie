-- Optional timed welcome prompt on clinic websites (embed-loader.js).

alter table public.clinics
  add column if not exists embed_auto_prompt boolean not null default false;

create or replace function public.get_clinic_embed_public(p_slug text)
returns table (
  slug text,
  name text,
  embed_auto_prompt boolean,
  embed_button_label text,
  embed_button_bg text,
  embed_button_text text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.slug,
    c.name,
    c.embed_auto_prompt,
    c.embed_button_label,
    coalesce(c.embed_button_bg, c.accent_color, '#9A8565') as embed_button_bg,
    c.embed_button_text
  from public.clinics c
  where c.slug = lower(trim(p_slug)) and c.active = true
  limit 1;
$$;

grant execute on function public.get_clinic_embed_public(text) to anon, authenticated;

drop function if exists public.get_my_clinics();

create function public.get_my_clinics()
returns table (
  id uuid,
  slug text,
  name text,
  lead_email text,
  website_url text,
  booking_url text,
  accent_color text,
  logo_url text,
  embed_button_label text,
  embed_button_bg text,
  embed_button_text text,
  notify_lead_email boolean,
  embed_auto_prompt boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.slug,
    c.name,
    c.lead_email,
    c.website_url,
    c.booking_url,
    c.accent_color,
    c.logo_url,
    c.embed_button_label,
    c.embed_button_bg,
    c.embed_button_text,
    c.notify_lead_email,
    c.embed_auto_prompt
  from public.clinics c
  inner join public.clinic_members m on m.clinic_id = c.id
  where m.user_id = auth.uid() and c.active = true
  order by c.name;
$$;

grant execute on function public.get_my_clinics() to authenticated;

drop function if exists public.update_my_clinic(uuid, text, text, text, text, text, boolean);

create or replace function public.update_my_clinic(
  p_clinic_id uuid,
  p_website_url text default null,
  p_booking_url text default null,
  p_embed_button_label text default null,
  p_embed_button_bg text default null,
  p_embed_button_text text default null,
  p_notify_lead_email boolean default null,
  p_embed_auto_prompt boolean default null
)
returns table (
  id uuid,
  slug text,
  name text,
  website_url text,
  booking_url text,
  embed_button_label text,
  embed_button_bg text,
  embed_button_text text,
  notify_lead_email boolean,
  embed_auto_prompt boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic_id and m.user_id = auth.uid()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.clinics c
  set
    website_url = nullif(trim(coalesce(p_website_url, c.website_url)), ''),
    booking_url = nullif(trim(coalesce(p_booking_url, c.booking_url)), ''),
    embed_button_label = nullif(trim(coalesce(p_embed_button_label, c.embed_button_label)), ''),
    embed_button_bg = nullif(trim(coalesce(p_embed_button_bg, c.embed_button_bg)), ''),
    embed_button_text = nullif(trim(coalesce(p_embed_button_text, c.embed_button_text)), ''),
    notify_lead_email = coalesce(p_notify_lead_email, c.notify_lead_email),
    embed_auto_prompt = coalesce(p_embed_auto_prompt, c.embed_auto_prompt)
  where c.id = p_clinic_id and c.active = true;

  return query
  select
    c.id,
    c.slug,
    c.name,
    c.website_url,
    c.booking_url,
    c.embed_button_label,
    c.embed_button_bg,
    c.embed_button_text,
    c.notify_lead_email,
    c.embed_auto_prompt
  from public.clinics c
  where c.id = p_clinic_id;
end;
$$;

grant execute on function public.update_my_clinic(uuid, text, text, text, text, text, boolean, boolean) to authenticated;
