create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null check (role in ('super_admin', 'admin')) default 'admin',
    created_at timestamptz not null default now()
);

create table if not exists public.appointments (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null,
    phone text,
    animal_type text,
    preferred_date date,
    preferred_time time,
    message text,
    lang text not null default 'en' check (lang in ('en', 'ar', 'ku')),
    status text not null default 'pending' check (status in ('pending', 'accepted', 'denied')),
    rejection_reason text,
    reviewed_by uuid references auth.users(id),
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text not null,
    pet_name text,
    service_inquiry text,
    message text not null,
    lang text not null default 'en' check (lang in ('en', 'ar', 'ku')),
    status text not null default 'new' check (status in ('new', 'resolved')),
    reviewed_by uuid references auth.users(id),
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.content_overrides (
    id bigserial primary key,
    lang text not null check (lang in ('en', 'ar', 'ku')),
    i18n_key text not null,
    value text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (lang, i18n_key)
);

create table if not exists public.site_settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id)
);

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.admin_profiles ap where ap.user_id = uid
    );
$$;

create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.admin_profiles ap where ap.user_id = uid and ap.role = 'super_admin'
    );
$$;

alter table public.admin_profiles enable row level security;
alter table public.appointments enable row level security;
alter table public.contact_messages enable row level security;
alter table public.content_overrides enable row level security;
alter table public.site_settings enable row level security;

-- Public can create appointment requests.
drop policy if exists "Public can create appointments" on public.appointments;
create policy "Public can create appointments"
on public.appointments
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can create contact messages" on public.contact_messages;
create policy "Public can create contact messages"
on public.contact_messages
for insert
to anon, authenticated
with check (true);

-- Admins can view and update appointments.
drop policy if exists "Admins can read appointments" on public.appointments;
create policy "Admins can read appointments"
on public.appointments
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update appointments" on public.appointments;
create policy "Admins can update appointments"
on public.appointments
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins manage contact messages" on public.contact_messages;
create policy "Admins manage contact messages"
on public.contact_messages
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Public can read website settings/overrides.
drop policy if exists "Public can read content overrides" on public.content_overrides;
create policy "Public can read content overrides"
on public.content_overrides
for select
to anon, authenticated
using (true);

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
on public.site_settings
for select
to anon, authenticated
using (true);

-- Admins can manage overrides/settings.
drop policy if exists "Admins manage content overrides" on public.content_overrides;
create policy "Admins manage content overrides"
on public.content_overrides
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Admins manage site settings"
on public.site_settings
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Admin profiles: admins can read, only super admins can mutate.
drop policy if exists "Admins can read admin profiles" on public.admin_profiles;
create policy "Admins can read admin profiles"
on public.admin_profiles
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Super admins can manage admin profiles" on public.admin_profiles;
create policy "Super admins can manage admin profiles"
on public.admin_profiles
for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

insert into public.site_settings (key, value)
values
    ('theme', '{"primary":"#2D6A4F","accent":"#4895EF","background":"#F8FAFC","surface":"#FFFFFF","text":"#0d1c2e"}'::jsonb),
    ('sections_visibility', '{"home":true,"services":true,"appointments":true,"contact":true}'::jsonb),
    ('image_overrides', '{}'::jsonb),
    ('button_overrides', '{}'::jsonb)
on conflict (key) do nothing;

-- Run this once after your first admin user exists.
-- replace FIRST_ADMIN_USER_ID with real UUID from auth.users.
-- insert into public.admin_profiles (user_id, role) values ('FIRST_ADMIN_USER_ID', 'super_admin') on conflict (user_id) do nothing;
