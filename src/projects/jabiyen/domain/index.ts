export type JabiyenArea = "public" | "admin";

export type JabiyenProjectConfig = {
  key: "jabiyen";
  displayName: "JABIYEN";
  publicClient: "JABIYEN-WEBSITE";
  adminClient: "JABIYEN-ADMIN";
  database: "separate-jabiyen-supabase";
  auth: "central-binzeo-auth";
};

export const JABIYEN_PROJECT: JabiyenProjectConfig = {
  key: "jabiyen",
  displayName: "JABIYEN",
  publicClient: "JABIYEN-WEBSITE",
  adminClient: "JABIYEN-ADMIN",
  database: "separate-jabiyen-supabase",
  auth: "central-binzeo-auth",
};
