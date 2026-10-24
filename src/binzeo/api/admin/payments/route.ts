import { getAdminServiceContext } from "@/binzeo/admin/lib/admin";
import { fail, ok } from "@/binzeo/admin/lib/api/response";

const MAX_PAGE_SIZE = 100;
const MAX_SITE_COUNT = 500;
const PAYMENT_STATUSES = ["pending", "paid", "cancelled", "expired", "refunded"] as const;

type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

type ProjectRow = {
  id: string;
  project_key: string;
  project_name: string;
  brand_name: string;
  status: string;
};

type PaymentRequestRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  external_order_reference: string;
  amount_minor: number | string;
  currency: string;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  binzeo_user_id: string | null;
  display_name: string | null;
  username: string | null;
};

type PaymentCustomerRow = {
  user_id: string;
  email_snapshot: string;
  name_snapshot: string | null;
};

function parsePositiveInteger(value: string | null, fallback: number, maximum: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) return null;
  return parsed;
}

export async function GET(request: Request) {
  const context = await getAdminServiceContext(request, "payments.read");
  if (!context) return fail("Payment history access is not permitted", 403, "PAYMENTS_READ_REQUIRED");

  const url = new URL(request.url);
  const page = parsePositiveInteger(url.searchParams.get("page"), 1, 100_000);
  const pageSize = parsePositiveInteger(url.searchParams.get("page_size"), 25, MAX_PAGE_SIZE);
  if (page === null || pageSize === null) {
    return fail("Invalid payment history pagination", 400, "INVALID_PAGINATION");
  }

  const rawStatus = url.searchParams.get("status")?.trim().toLowerCase() ?? "";
  if (rawStatus && rawStatus !== "all" && !PAYMENT_STATUSES.includes(rawStatus as PaymentStatus)) {
    return fail("Invalid payment status filter", 400, "INVALID_STATUS_FILTER");
  }
  const status = rawStatus && rawStatus !== "all" ? rawStatus as PaymentStatus : null;

  const rawSiteKey = url.searchParams.get("site")?.trim().toLowerCase() ?? "";
  const siteKey = rawSiteKey === "all" ? "" : rawSiteKey;
  if (siteKey.length > 80 || (siteKey && !/^[a-z0-9][a-z0-9-]*$/.test(siteKey))) {
    return fail("Invalid website filter", 400, "INVALID_SITE_FILTER");
  }

  const admin = context.admin;
  const first = (page - 1) * pageSize;
  const last = first + pageSize - 1;

  let selectedProjectId: string | null = null;
  if (siteKey) {
    const { data: selectedProject, error: selectedProjectError } = await admin
      .from("platform_projects")
      .select("id")
      .eq("project_key", siteKey)
      .limit(1)
      .maybeSingle();
    if (selectedProjectError) {
      console.error("[ADMIN_PAYMENT_PROJECT_FILTER_FAILED]", selectedProjectError.code ?? "UNKNOWN");
      return fail("Could not load payment records", 503, "PAYMENTS_READ_FAILED");
    }
    if (!selectedProject) {
      return ok({ rows: [], sites: [], pagination: { page, page_size: pageSize, total: 0, total_pages: 0 } });
    }
    selectedProjectId = selectedProject.id;
  }

  let requestsQuery = admin
    .from("payment_requests")
    .select("id,project_id,user_id,external_order_reference,amount_minor,currency,status,paid_at,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(first, last);
  if (status) requestsQuery = requestsQuery.eq("status", status);
  if (selectedProjectId) requestsQuery = requestsQuery.eq("project_id", selectedProjectId);

  const [{ data: rawRequests, error: requestsError, count }, { data: rawProjects, error: projectsError }] = await Promise.all([
    requestsQuery,
    admin.from("platform_projects")
      .select("id,project_key,project_name,brand_name,status")
      .order("project_name", { ascending: true })
      .limit(MAX_SITE_COUNT),
  ]);

  if (requestsError || projectsError) {
    console.error("[ADMIN_PAYMENT_LIST_FAILED]", requestsError?.code ?? projectsError?.code ?? "UNKNOWN");
    return fail("Could not load payment records", 503, "PAYMENTS_READ_FAILED");
  }

  const requests = (rawRequests ?? []) as PaymentRequestRow[];
  const projects = (rawProjects ?? []) as ProjectRow[];
  const userIds = [...new Set(requests.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];

  const [customerResult, profileResult] = await Promise.all([
    userIds.length
      ? admin.from("payment_customers").select("user_id,email_snapshot,name_snapshot").in("user_id", userIds).limit(userIds.length)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? admin.from("profiles").select("id,binzeo_user_id,display_name,username").in("id", userIds).limit(userIds.length)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customerResult.error || profileResult.error) {
    console.error("[ADMIN_PAYMENT_IDENTITY_LOOKUP_FAILED]", customerResult.error?.code ?? profileResult.error?.code ?? "UNKNOWN");
    return fail("Could not load payment account references", 503, "PAYMENTS_IDENTITY_READ_FAILED");
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const customerByUserId = new Map(((customerResult.data ?? []) as PaymentCustomerRow[]).map((row) => [row.user_id, row]));
  const profileById = new Map(((profileResult.data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
  const siteCatalog = projects.map((project) => ({
    project_id: project.id,
    site_key: project.project_key,
    site_name: project.project_name,
    brand_name: project.brand_name,
    status: project.status,
  }));

  const rows = requests.map((requestRow) => {
    const project = projectById.get(requestRow.project_id);
    const profile = requestRow.user_id ? profileById.get(requestRow.user_id) : undefined;
    const customer = requestRow.user_id ? customerByUserId.get(requestRow.user_id) : undefined;
    return {
      payment_request_id: requestRow.id,
      website_id: requestRow.project_id,
      website_key: project?.project_key ?? "unknown",
      website_name: project?.project_name ?? project?.brand_name ?? "Unknown website",
      brand_name: project?.brand_name ?? null,
      user_id: requestRow.user_id,
      binzeo_user_id: profile?.binzeo_user_id ?? null,
      username: profile?.username ?? null,
      user_name: customer?.name_snapshot ?? profile?.display_name ?? null,
      user_email: customer?.email_snapshot ?? null,
      order_id: requestRow.external_order_reference,
      amount_minor: Number(requestRow.amount_minor),
      currency: requestRow.currency,
      status: requestRow.status,
      created_at: requestRow.created_at,
      paid_at: requestRow.paid_at,
    };
  });

  const total = count ?? 0;
  return ok({
    rows,
    sites: siteCatalog,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: total ? Math.ceil(total / pageSize) : 0,
    },
  });
}
