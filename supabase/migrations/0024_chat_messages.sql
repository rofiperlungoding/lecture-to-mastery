create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_lookup
  on chat_messages (user_id, document_id, created_at);

alter table chat_messages enable row level security;

create policy "Users can view their own chat messages"
  on chat_messages for select
  using (user_id = auth.uid());

create policy "Users can insert their own chat messages"
  on chat_messages for insert
  with check (user_id = auth.uid());

create policy "Users can update their own chat messages"
  on chat_messages for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own chat messages"
  on chat_messages for delete
  using (user_id = auth.uid());
