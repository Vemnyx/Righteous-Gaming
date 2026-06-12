/** Matches backend/internal/domain/user.go */
export const ROLE_ADMIN = 0;
export const ROLE_MEMBER = 1;
export const ROLE_GUEST = 2;

/** @param {number | null | undefined} role */
export function isAdminRole(role) {
  return Number(role) === ROLE_ADMIN;
}

/** @param {number | null | undefined} role */
export function isGuestRole(role) {
  return Number(role) === ROLE_GUEST;
}

/** @param {number | null | undefined} role */
export function canWriteContent(role) {
  const n = Number(role);
  return n === ROLE_ADMIN || n === ROLE_MEMBER;
}

/** @param {number | null | undefined} role */
export function canBrowseAllDecks(role) {
  const n = Number(role);
  return n === ROLE_ADMIN || n === ROLE_GUEST;
}

/** @param {number | null | undefined} role */
export function canAccessCardRaterResource(role) {
  return canWriteContent(role);
}

/** @param {number | null | undefined} role */
export function roleLabel(role) {
  if (Number(role) === ROLE_ADMIN) return "Admin";
  if (Number(role) === ROLE_MEMBER) return "Member";
  if (Number(role) === ROLE_GUEST) return "Guest";
  return String(role ?? "—");
}
