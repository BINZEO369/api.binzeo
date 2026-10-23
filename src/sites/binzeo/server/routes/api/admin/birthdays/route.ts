import { NextRequest } from "next/server";
import { getAdminServiceContext } from "@/sites/binzeo/admin/lib/admin";
import { fail, ok } from "@/sites/binzeo/auth/lib/api/response";
import { calculateAge } from "@/sites/binzeo/auth/lib/birthday";
import { getAuthEmailMap } from "@/sites/binzeo/auth/lib/admin-email-audience";

export async function GET(request: NextRequest) {
  const context = await getAdminServiceContext(request, "marketing.send");
  if (!context) return fail("Marketing email permission required", 403, "MARKETING_SEND_REQUIRED");
  const year = new Date().getUTCFullYear();
  const today = new Date();
  const month = String(today.getUTCMonth() + 1).padStart(2, "0");
  const day = String(today.getUTCDate()).padStart(2, "0");
  const [{ data: profiles, error: profileError }, { data: birthdays, error: birthdayError }, { data: deliveries, error: deliveryError }] = await Promise.all([
    context.admin.from("profiles").select("id,binzeo_user_id,display_name,first_name,last_name,profile_photo_url,account_status,marketing_email,date_of_birth,country_code,preferred_language,created_at").eq("account_status", "active").not("date_of_birth", "is", null).order("date_of_birth").limit(1000),
    context.admin.from("user_birthdays").select("user_id,birth_date,current_age,age_calculated_at,email,display_name,last_birthday_wish_year,last_birthday_wish_sent_at").limit(1000),
    context.admin.from("birthday_email_deliveries").select("user_id,birthday_year,status,sent_at,error_message").eq("birthday_year", year).limit(1000),
  ]);
  if (profileError || birthdayError || deliveryError) return fail(profileError?.message ?? birthdayError?.message ?? deliveryError?.message ?? "Birthday data could not be loaded", 500, "BIRTHDAY_DATA_FAILED");
  const birthdayMap = new Map((birthdays ?? []).map((row) => [row.user_id, row]));
  const deliveryMap = new Map((deliveries ?? []).map((row) => [row.user_id, row]));
  const authEmails = await getAuthEmailMap(context.admin, (profiles ?? []).filter((profile) => profile.marketing_email).map((profile) => profile.id));
  const users = (profiles ?? []).filter((profile) => profile.marketing_email).map((profile) => {
    const record = birthdayMap.get(profile.id);
    const birthDate = profile.date_of_birth ?? record?.birth_date ?? null;
    const delivery = deliveryMap.get(profile.id);
    return { ...profile, email: authEmails.get(profile.id) ?? record?.email ?? null, birth_date: birthDate, age: birthDate ? calculateAge(birthDate) : null, is_today: !!birthDate && birthDate.slice(5, 10) === `${month}-${day}`, birthday_delivery: delivery ?? null };
  });
  return ok({ year, today: `${year}-${month}-${day}`, users, today_count: users.filter((user) => user.is_today).length, audience_truncated: (profiles ?? []).length >= 1000 });
}
