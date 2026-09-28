import type { Role } from "../types/index.ts";

/** Landing page per role. */
export const roleHome = (role: Role | null | undefined): string => (role === "admin" ? "/inbox" : "/escalations");

const STAFF_ALLOWED = [/^\/escalations(\/|$)/, /^\/conversations\/[^/]+$/];

/** Whether a role may land on a path (used to honour "from" after login). */
export function canVisit(role: Role, pathname: string): boolean {
  if (pathname === "/login") return false;
  if (role === "admin") return true;
  return STAFF_ALLOWED.some((re) => re.test(pathname));
}
