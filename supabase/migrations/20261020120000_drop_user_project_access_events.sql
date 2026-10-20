-- Project-access audit data is intentionally removed from the platform.
-- Authentication and profile/session flows do not depend on this table.
DROP TABLE IF EXISTS public.user_project_access_events CASCADE;
