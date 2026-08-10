package domain

// CanWriteContent reports whether the role may create or mutate general app content
// (events, deck sources, etc.). Decks and recordings use CanWriteDecksAndRecordings.
func (r Role) CanWriteContent() bool {
	switch r {
	case RoleAdmin, RoleMember:
		return true
	default:
		return false
	}
}

// CanWriteDecksAndRecordings reports whether the role may create or mutate decks
// and recordings (including recording comments).
func (r Role) CanWriteDecksAndRecordings() bool {
	switch r {
	case RoleAdmin, RoleMember, RolePlayTester:
		return true
	default:
		return false
	}
}

// CanAccessCardRaterResource reports whether the role may use the interactive
// card rater (rate cards, manage sessions). Guests and play testers may only
// view aggregated data when they have CanAccessData.
func (r Role) CanAccessCardRaterResource() bool {
	return r.CanWriteContent()
}

// CanBrowseAllDecks reports whether the role may list and open any team deck.
// Members only see their own imports; admins and play testers see the full library.
func (r Role) CanBrowseAllDecks() bool {
	switch r {
	case RoleAdmin, RolePlayTester:
		return true
	default:
		return false
	}
}

// CanAccessData reports whether the role may open the Data tab and its analytics APIs.
func (r Role) CanAccessData() bool {
	switch r {
	case RoleAdmin, RoleMember, RolePlayTester:
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
