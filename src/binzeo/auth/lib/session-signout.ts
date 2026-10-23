type LocalSignOutResult = { error: { message: string } | null };

type LocalSignOutClient = {
  signOut: (options: { scope: "local" }) => Promise<LocalSignOutResult>;
};

/** Clear only the session belonging to the current app origin. */
export function signOutCurrentAppSession(auth: LocalSignOutClient) {
  return auth.signOut({ scope: "local" });
}
