import { getAdminApiContext, getAdminDataClient } from "@/modules/admin/lib/admin";
import { fail, ok } from "@/modules/admin/lib/api/response";

export const dynamic = "force-dynamic";
export async function GET() {
  const { user, access } = await getAdminApiContext();
  if (!user || !access) return fail("Forbidden", 403, "ADMIN_REQUIRED");
  try {
    const db = await getAdminDataClient(access);
    const [{ data: sectors, error: sectorError }, { data: countries, error: countryError }] = await Promise.all([
      db.from("sectors").select("sector_code,sector_name,is_active,created_at").order("sector_name").limit(100),
      db.from("countries").select("country_code,country_name,phone_code,is_active").order("country_name").limit(250),
    ]);
    if (sectorError || countryError) return fail("Reference data could not be loaded", 500, "REFERENCE_DATA_FAILED");
    return ok({ sectors: sectors ?? [], countries: countries ?? [] });
  } catch {
    return fail("Reference data could not be loaded", 500, "REFERENCE_DATA_FAILED");
  }
}
