// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.JABIYEN_SUPABASE_URL;
const SUPABASE_KEY = process.env.JABIYEN_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("JABIYEN database environment is not configured");
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function createSlug(text) {
  if (!text) return "";
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
export function formatProduct(product) {
  if (!product) return null;
  return { ...product, category: product.categories?.name || null, subcategory: product.subcategories?.name || null };
}
export function formatProducts(products) { return (products || []).map(formatProduct); }
