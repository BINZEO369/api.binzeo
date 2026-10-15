import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export async function getAuthEmailMap(admin: AdminClient, profileIds: string[]) {
  const wanted = new Set(profileIds);
  const result = new Map<string, string>();
  if (!wanted.size) return result;

  if (wanted.size <= 100) {
    const ids = [...wanted];
    for (let index = 0; index < ids.length; index += 20) {
      const batch = ids.slice(index, index + 20);
      const users = await Promise.all(batch.map(async (id) => {
        const { data, error } = await admin.auth.admin.getUserById(id);
        return !error && data.user?.email ? { id, email: data.user.email } : null;
      }));
      for (const user of users) if (user) result.set(user.id, user.email);
    }
    return result;
  }

  const perPage = 1000;
  for (let page = 1; wanted.size && page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data.users ?? [];
    for (const user of users) {
      if (wanted.has(user.id) && user.email) {
        result.set(user.id, user.email);
        wanted.delete(user.id);
      }
    }
    if (users.length < perPage) break;
  }
  return result;
}
