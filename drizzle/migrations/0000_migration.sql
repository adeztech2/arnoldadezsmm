create type public.app_role as enum ('user','admin','super_admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  country text not null default 'KE',
  balance bigint not null default 0 check (balance >= 0),
  disabled boolean not null default false,
  country_locked boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','super_admin'))
$$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "update own name" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- users may only change name / country (country only while not locked)
revoke update on public.profiles from authenticated;
grant update (name, country) on public.profiles to authenticated;
create or replace function public.guard_country() returns trigger language plpgsql set search_path=public as $$
begin
  if new.country is distinct from old.country and old.country_locked and current_user = 'authenticated' then
    raise exception 'Country is locked after financial activity';
  end if;
  return new;
end $$;
create trigger profiles_guard_country before update on public.profiles for each row execute function public.guard_country();

create table public.settings (
  id text primary key default 'site',
  site_name text not null default 'ADEZ SMM',
  tagline text not null default 'Your next chapter of growth starts here.',
  support_email text not null default '',
  announcement text not null default '',
  wallet_currency text not null default 'KES',
  paystack_currency text not null default 'KES',
  provider_currency text not null default '',
  provider_to_wallet_rate numeric not null default 0,
  paystack_to_wallet_rate numeric not null default 1,
  min_deposit bigint not null default 10000,
  default_markup_percent numeric not null default 30,
  registration_open boolean not null default true,
  maintenance boolean not null default false,
  last_sync_at timestamptz,
  first_user_registered boolean not null default false
);
grant select on public.settings to anon, authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "public settings" on public.settings for select to anon, authenticated using (true);
insert into public.settings (id) values ('site');

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare first boolean;
begin
  insert into public.profiles (id, name, email, country)
  values (new.id, coalesce(new.raw_user_meta_data->>'name',''), coalesce(new.email,''), coalesce(nullif(new.raw_user_meta_data->>'country',''),'KE'));
  update public.settings set first_user_registered = true where id='site' and first_user_registered = false returning true into first;
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  if first then insert into public.user_roles (user_id, role) values (new.id, 'super_admin'); end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id text unique not null,
  name text not null default '',
  category text not null default 'Other',
  type text not null default 'Default',
  min integer not null default 1,
  max integer not null default 1,
  provider_rate numeric not null default 0,
  provider_currency text not null default '',
  selling_rate numeric,
  enabled boolean not null default false,
  available boolean not null default true,
  supported boolean not null default true,
  refill boolean not null default false,
  cancel boolean not null default false,
  requirements text[] not null default '{}',
  pricing_unit text not null default '1000',
  description text not null default '',
  updated_at timestamptz not null default now()
);
grant select on public.services to anon, authenticated;
grant all on public.services to service_role;
alter table public.services enable row level security;
create policy "orderable services" on public.services for select to anon, authenticated
  using ((enabled and available and supported and selling_rate > 0) or public.is_staff(auth.uid()));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  service_id uuid references public.services(id),
  service_name text not null default '',
  provider_service_id text,
  provider_order_id text unique,
  idempotency_key text not null,
  link text not null default '',
  quantity integer not null default 0,
  fields jsonb not null default '{}',
  charge bigint not null default 0,
  provider_cost bigint not null default 0,
  refund_amount bigint not null default 0,
  status text not null default 'Submitting',
  start_count integer not null default 0,
  remains integer,
  refill boolean not null default false,
  cancel boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index on public.orders (user_id, created_at desc);
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "own orders" on public.orders for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  amount bigint not null,
  balance_after bigint not null,
  description text not null default '',
  reference text unique not null,
  created_at timestamptz not null default now()
);
create index on public.transactions (user_id, created_at desc);
grant select on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
create policy "own tx" on public.transactions for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  reference text unique not null,
  gateway text not null,
  amount bigint not null,
  currency text not null default 'KES',
  pay_amount bigint not null,
  pay_currency text not null,
  status text not null default 'initializing',
  checkout_request_id text,
  phone text,
  authorization_url text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "own payments" on public.payments for select to authenticated using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null, action text not null, target text not null default '', detail text not null default '',
  created_at timestamptz not null default now()
);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "staff audit" on public.audit_log for select to authenticated using (public.is_staff(auth.uid()));

-- Atomic wallet movement (service role only). amount positive=credit, negative=debit. Idempotent on reference.
create or replace function public.wallet_apply(_user uuid, _amount bigint, _type text, _description text, _reference text)
returns bigint language plpgsql security definer set search_path = public as $$
declare newbal bigint; existing bigint;
begin
  select balance_after into existing from public.transactions where reference = _reference;
  if found then return existing; end if;
  update public.profiles set balance = balance + _amount, country_locked = true
    where id = _user and balance + _amount >= 0 returning balance into newbal;
  if newbal is null then raise exception 'Insufficient balance'; end if;
  insert into public.transactions (user_id, type, amount, balance_after, description, reference)
    values (_user, _type, _amount, newbal, _description, _reference);
  return newbal;
end $$;
revoke all on function public.wallet_apply(uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.wallet_apply(uuid,bigint,text,text,text) to service_role;

-- Map for imported MongoDB users
create table public.legacy_users (
  legacy_id text primary key,
  email text not null unique,
  name text not null default '',
  country text not null default 'KE',
  role text not null default 'user',
  balance bigint not null default 0,
  user_id uuid,
  claimed_at timestamptz
);
grant all on public.legacy_users to service_role;
alter table public.legacy_users enable row level security;