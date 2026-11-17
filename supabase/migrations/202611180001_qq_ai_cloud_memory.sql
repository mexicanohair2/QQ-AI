create table if not exists public.qq_ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Новый диалог',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qq_ai_threads_messages_array check (jsonb_typeof(messages) = 'array')
);
create index if not exists qq_ai_threads_user_updated_idx on public.qq_ai_threads (user_id, updated_at desc);
alter table public.qq_ai_threads enable row level security;
create policy "QQ AI users read own threads" on public.qq_ai_threads for select to authenticated using ((select auth.uid()) = user_id);
create policy "QQ AI users insert own threads" on public.qq_ai_threads for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "QQ AI users update own threads" on public.qq_ai_threads for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "QQ AI users delete own threads" on public.qq_ai_threads for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.qq_ai_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  memory_enabled boolean not null default false,
  learned_preferences jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint qq_ai_preferences_array check (jsonb_typeof(learned_preferences) = 'array')
);
alter table public.qq_ai_preferences enable row level security;
create policy "QQ AI users manage own preferences" on public.qq_ai_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.qq_ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.qq_ai_threads(id) on delete set null,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now()
);
create index if not exists qq_ai_feedback_user_created_idx on public.qq_ai_feedback (user_id, created_at desc);
alter table public.qq_ai_feedback enable row level security;
create policy "QQ AI users insert own feedback" on public.qq_ai_feedback for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "QQ AI users read own feedback" on public.qq_ai_feedback for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.qq_ai_threads to authenticated;
grant select, insert, update, delete on public.qq_ai_preferences to authenticated;
grant select, insert on public.qq_ai_feedback to authenticated;