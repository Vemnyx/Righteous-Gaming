/** Matches backend/internal/domain/user.go */
export const ROLE_ADMIN = 0;
export const ROLE_MEMBER = 1;
export const ROLE_GUEST = 2;
export const ROLE_PLAY_TESTER = 3;

/** @param {number | null | undefined} role */
export function isAdminRole(role) {
  return Number(role) === ROLE_ADMIN;
}

/** @param {number | null | undefined} role */
export function isGuestRole(role) {
  return Number(role) === ROLE_GUEST;
}

/** @param {number | null | undefined} role */
export function isPlayTesterRole(role) {
  return Number(role) === ROLE_PLAY_TESTER;
}

/** @param {number | null | undefined} role */
export function canWriteContent(role) {
  const n = Number(role);
  return n === ROLE_ADMIN || n === ROLE_MEMBER;
}

/** @param {number | null | undefined} role */
export function canWriteDecksAndRecordings(role) {
  const n = Number(role);
  return n === ROLE_ADMIN || n === ROLE_MEMBER || n === ROLE_PLAY_TESTER;
}

/** @param {number | null | undefined} role */
export function canBrowseAllDecks(role) {
  const n = Number(role);
  return n === ROLE_ADMIN || n === ROLE_PLAY_TESTER;
}

/** @param {number | null | undefined} role */
export function canAccessCardRaterResource(role) {
  return canWriteContent(role);
}

/** @param {number | null | undefined} role */
export function canAccessData(role) {
  const n = Number(role);
  return n === ROLE_ADMIN || n === ROLE_MEMBER || n === ROLE_PLAY_TESTER;
}

/** Play Testing / Looking For Games: same audience as Meetings & Release Teams. */
/** @param {number | null | undefined} role */
/** @param {{ email?: string | null } | null | undefined} [_profile] */
export function canAccessPlayTesting(role, _profile) {
  return canAccessMeetings(role);
}

/** Meetings resource: everyone except Guests. */
/** @param {number | null | undefined} role */
export function canAccessMeetings(role) {
  const n = Number(role);
  return n === ROLE_ADMIN || n === ROLE_MEMBER || n === ROLE_PLAY_TESTER;
}

/** Release Teams resource: same audience as Meetings. */
/** @param {number | null | undefined} role */
export function canAccessReleaseTeams(role) {
  return canAccessMeetings(role);
}

/** @param {number | null | undefined} role */
export function roleLabel(role) {
  if (Number(role) === ROLE_ADMIN) return "Admin";
  if (Number(role) === ROLE_MEMBER) return "Member";
  if (Number(role) === ROLE_GUEST) return "Guest";
  if (Number(role) === ROLE_PLAY_TESTER) return "Play Tester";
  return String(role ?? "—");
}
