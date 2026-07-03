-- Auto-provision a profiles row when a new Supabase auth user is created.
-- Covers both OAuth (Google SSO) and email/password sign-ups.
--
-- Domain enforcement: only @gorgias.com addresses may create an account.
-- Any other domain raises an exception, which rolls back the auth.users
-- INSERT, so no account (and no profile) is ever created. This is the
-- server-side backstop behind the Google "Internal" consent screen and the
-- client-side check in AuthContext.
--
-- New users start as 'agent' (can read, cannot score/edit) until an admin
-- promotes them to 'lead' or 'admin' from the dashboard.

-- profiles never had an email column; add it so we can store the login email.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reject any non-gorgias.com address (case-insensitive).
  IF lower(NEW.email) NOT LIKE '%@gorgias.com' THEN
    RAISE EXCEPTION 'Only @gorgias.com accounts are allowed (got %)', NEW.email
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    'agent'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop if exists so re-running the migration is safe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
