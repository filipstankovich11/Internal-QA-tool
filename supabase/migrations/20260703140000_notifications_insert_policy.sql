-- Tighten notification inserts: previously any authenticated user could insert
-- notifications addressed to anyone (spoofed "score published" messages, spam).
-- Direct inserts are a reviewer action everywhere in the app; agent-triggered
-- notifications (disputes, acknowledgements) go through the notify_admins
-- security-definer RPC, which is unaffected by this policy.

drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications
  for insert with check (public.current_user_role() in ('admin', 'lead'));
