create extension if not exists pgcrypto;

create table if not exists public.posts (
    id text primary key,
    title text not null,
    category text not null,
    tag_class text not null default '',
    icon text not null default '',
    icon_class text not null default '',
    date text not null,
    read_time text not null,
    content text not null,
    is_announcement boolean not null default false,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.subscribers (
    email text primary key,
    unsubscribe_token text not null unique,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.subscribers
    add column if not exists unsubscribe_token text;

alter table public.subscribers
    add column if not exists status text;

update public.subscribers
set unsubscribe_token = gen_random_uuid()::text
where unsubscribe_token is null or btrim(unsubscribe_token) = '';

update public.subscribers
set status = 'active'
where status is null or btrim(status) = '';

alter table public.subscribers
    alter column unsubscribe_token set not null;

alter table public.subscribers
    alter column status set default 'active';

alter table public.subscribers
    alter column status set not null;

create unique index if not exists subscribers_unsubscribe_token_idx
    on public.subscribers (unsubscribe_token);

alter table public.posts enable row level security;
alter table public.subscribers enable row level security;

-- The backend should use the service role key from Render.
-- No public RLS policies are defined here.

create or replace function public.set_post_defaults()
returns trigger
language plpgsql
as $$
begin
    if new.id is null or btrim(new.id) = '' then
        new.id := gen_random_uuid()::text;
    end if;

    if new.created_at is null then
        new.created_at = now();
    end if;

    new.updated_at = now();
    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'posts_set_defaults'
          and tgrelid = 'public.posts'::regclass
    ) then
        create trigger posts_set_defaults
        before insert or update on public.posts
        for each row
        execute function public.set_post_defaults();
    end if;
end;
$$;

create or replace function public.set_subscriber_defaults()
returns trigger
language plpgsql
as $$
begin
    if new.unsubscribe_token is null or btrim(new.unsubscribe_token) = '' then
        new.unsubscribe_token := gen_random_uuid()::text;
    end if;

    new.email := lower(btrim(new.email));
    if new.status is null or btrim(new.status) = '' then
        new.status := 'active';
    else
        new.status := lower(btrim(new.status));
    end if;
    if new.created_at is null then
        new.created_at = now();
    end if;
    new.updated_at = now();
    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'subscribers_set_defaults'
          and tgrelid = 'public.subscribers'::regclass
    ) then
        create trigger subscribers_set_defaults
        before insert or update on public.subscribers
        for each row
        execute function public.set_subscriber_defaults();
    end if;
end;
$$;
