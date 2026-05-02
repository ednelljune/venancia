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

alter table public.posts enable row level security;

-- The backend should use the service role key from Render.
-- No public RLS policies are defined here.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists posts_set_updated_at on public.posts;

create trigger posts_set_updated_at
before update on public.posts
for each row
execute function public.set_updated_at();
