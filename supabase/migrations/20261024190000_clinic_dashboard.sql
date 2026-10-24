-- Phase 2: clinic staff can read leads for their clinic.

create table if not exists public.clinic_members (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);

alter table public.clinic_members enable row level security;

drop policy if exists "clinic_members_select_own" on public.clinic_members;
create policy "clinic_members_select_own"
  on public.clinic_members for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.clinic_members to authenticated;

drop policy if exists "atelier_leads_select_clinic_staff" on public.atelier_leads;
create policy "atelier_leads_select_clinic_staff"
  on public.atelier_leads for select
  to authenticated
  using (
    exists (
      select 1
      from public.clinic_members m
      where m.user_id = auth.uid()
        and m.clinic_id = atelier_leads.clinic_id
    )
  );

create or replace function public.get_my_clinics()
returns table (
  id uuid,
  slug text,
  name text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.name
  from public.clinics c
  inner join public.clinic_members m on m.clinic_id = c.id
  where m.user_id = auth.uid() and c.active = true
  order by c.name;
$$;

grant execute on function public.get_my_clinics() to authenticated;
