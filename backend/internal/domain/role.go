package domain

// CanWriteContent reports whether the role may create or mutate app content
// (decks, recordings, card rater sessions, comments, etc.).
func (r Role) CanWriteContent() bool {
	switch r {
	case RoleAdmin, RoleMember:
		return true
	default:
		return false
	}
}

// CanAccessCardRaterResource reports whether the role may use the interactive
// card rater (rate cards, manage sessions). Guests may only view aggregated data.
func (r Role) CanAccessCardRaterResource() bool {
	return r.CanWriteContent()
}

// CanBrowseAllDecks reports whether the role may list and open any team deck.
// Members only see their own imports; guests and admins see the full library.
func (r Role) CanBrowseAllDecks() bool {
	switch r {
	case RoleAdmin, RoleGuest:
		return true
	default:
		return false
	}
}

// CountsForTeamSnapshot reports whether the user should appear in event team views.
func (r Role) CountsForTeamSnapshot() bool {
	switch r {
	case RoleAdmin, RoleMember:
		return true
	default:
		return false
	}
}
