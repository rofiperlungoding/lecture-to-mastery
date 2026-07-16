# Ownership Transition Plan (Phase B2)

## Problem

The app launched without authentication — all data (documents, chunks, flashcards,
quiz_questions, etc.) has `user_id = NULL`. Phase B1 adds real auth (email/password,
magic-link, Google OAuth, anonymous). Phase B2 must backfill ownership so each user sees
only their own data, without locking out or breaking the existing demo/guest flow.

## Strategy: Soft transition in 3 steps

### Step 1 — Migration: add `user_id` columns + index

Every content table gets:
```sql
alter table documents      add column user_id uuid references auth.users(id);
alter table chunks         add column user_id uuid references auth.users(id);
alter table flashcards     add column user_id uuid references auth.users(id);
alter table quiz_questions add column user_id uuid references auth.users(id);
alter table quiz_attempts  add column user_id uuid references auth.users(id);
alter table study_events   add column user_id uuid references auth.users(id);
alter table concept_mastery add column user_id uuid references auth.users(id);
alter table doc_artifacts  add column user_id uuid references auth.users(id);
alter table notes          add column user_id uuid references auth.users(id);
alter table highlights     add column user_id uuid references auth.users(id);
alter table review_log     add column user_id uuid references auth.users(id);

create index idx_documents_user_id on documents(user_id);
-- … similar indexes for every table above
```

All columns are **nullable** — existing rows keep `NULL` and remain visible to all users.

### Step 2 — Set `user_id` on write

Update every API endpoint (edge functions + client-side inserts) to set `user_id` to the
authenticated user's ID (`auth.uid()` in Supabase, `session.user.id` client-side).

For anonymous users, `user_id` is set to their Supabase anonymous user ID (which persists
as long as the session cookie lives).

Existing rows with `NULL` remain readable by everyone — no user loses access to data they
created before auth.

### Step 3 — Row-Level Security (RLS) with ownership fallback

Enable RLS on every table with a policy like:

```sql
create policy "Users can read own rows or legacy NULL rows"
  on documents for select
  using (user_id = auth.uid() or user_id is null);

create policy "Users can insert own rows"
  on documents for insert
  with check (user_id = auth.uid());

create policy "Users can update own rows"
  on documents for update
  using (user_id = auth.uid());

create policy "Users can delete own rows"
  on documents for delete
  using (user_id = auth.uid());
```

The `user_id is null` clause is the **transition key**: it lets every user see the original
demo/seed data while slowly migrating to per-user data.

### Step 4 — (Optional) backfill existing data

Once auth is stable, run a one-time script to assign orphan rows to a "system" user or
to the first user who claims them:

```sql
-- Assign all NULL-owner rows to the first real (non-anonymous) user
update documents
set user_id = (select id from auth.users where email is not null limit 1)
where user_id is null;
```

This step is safe to defer indefinitely — the `user_id is null` policy ensures no data is
hidden.

## Rolling back

If RLS causes issues, simply re-run the migration without RLS:

```sql
alter table documents disable row level security;
-- … repeat for all tables
```

Data integrity is preserved because `user_id` is just a nullable FK — disabling RLS
reverts to the current open-access behaviour.

## Summary

| Step | Action | Risk | When |
|------|--------|------|------|
| 1 | Add nullable `user_id` columns | None — additive schema change | B2 start |
| 2 | Set `user_id` on new inserts | Low — existing queries unaffected | B2 |
| 3 | Enable RLS with NULL fallback | Low — legacy data still readable | B2 end |
| 4 | Backfill orphan rows | Low — one-time SQL, reversible | After B2 stabilises |
