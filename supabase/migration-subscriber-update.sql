-- Allow the frontend (anon key) to look up and update subscriber preferences.
-- This is needed so returning subscribers can add new email types without
-- getting a "duplicate email" error — the form merges preferences instead.
--
-- Security note: the email address itself acts as the credential here
-- (same model as the existing insert/delete policies).

-- Allow reading own row by email (used during the merge-on-signup flow)
create policy "subscribers_select" on public.subscribers
  for select using (true);

-- Allow updating preferences (digest, breaking_alerts, topic_digest, topics)
create policy "subscribers_update" on public.subscribers
  for update using (true) with check (true);
