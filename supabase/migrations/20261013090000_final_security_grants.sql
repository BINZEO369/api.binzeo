-- Final explicit role revocations. PUBLIC revoke does not remove explicit role grants.
revoke execute on function public.cleanup_expired_pending_accounts() from anon, authenticated;

revoke all on function private.has_admin_permission(uuid, text) from public, anon;
revoke all on function private.is_admin(uuid) from public, anon;
grant execute on function private.has_admin_permission(uuid, text) to authenticated, service_role;
grant execute on function private.is_admin(uuid) to authenticated, service_role;

revoke all on function public.assign_profile_binzeo_user_id() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.promote_profile_id_for_admin() from public, anon, authenticated;
revoke all on function public.sync_user_auth_method() from public, anon, authenticated;
revoke all on function public.sync_user_verification_records() from public, anon, authenticated;

revoke all on table public.user_two_factor_settings from anon, authenticated;
revoke all on table public.user_verification_records from anon;
revoke insert, update, delete, references, trigger, truncate on table public.user_verification_records from authenticated;
revoke all on table public.admin_activity_logs from anon;
revoke delete, update, references, trigger, truncate on table public.admin_activity_logs from authenticated;
