create table if not exists user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  daily_goal int not null default 20,
  theme text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "Users can view their own settings"
  on user_settings for select
  using (user_id = auth.uid());

create policy "Users can insert their own settings"
  on user_settings for insert
  with check (user_id = auth.uid());

create policy "Users can update their own settings"
  on user_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own settings"
  on user_settings for delete
  using (user_id = auth.uid());
