import { getSupabaseAdmin } from "@/user/auth/lib/supabase/admin";

export function validateBirthDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid date of birth.";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Enter a valid date of birth.";
  if (date > new Date()) return "Date of birth cannot be in the future.";
  return null;
}

export function calculateAge(value: string, asOf = new Date()) {
  const birth = new Date(`${value}T00:00:00Z`);
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const month = asOf.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && asOf.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export async function upsertUserBirthday({ userId, email, displayName, birthDate }: { userId: string; email: string; displayName: string; birthDate: string }) {
  const errorMessage = validateBirthDate(birthDate);
  if (errorMessage) throw new Error(errorMessage);
  const admin = getSupabaseAdmin();
  const calculatedAt = new Date();
  const { error } = await admin.from("user_birthdays").upsert({
    user_id: userId,
    birth_date: birthDate,
    current_age: calculateAge(birthDate, calculatedAt),
    age_calculated_at: calculatedAt.toISOString().slice(0, 10),
    email,
    display_name: displayName,
  }, { onConflict: "user_id" });
  if (error) throw error;
}
