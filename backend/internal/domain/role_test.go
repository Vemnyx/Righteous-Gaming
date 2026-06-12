package domain

import "testing"

func TestRoleGuestPermissions(t *testing.T) {
	if RoleGuest.CanWriteContent() {
		t.Fatal("guest should not write content")
	}
	if !RoleGuest.CanBrowseAllDecks() {
		t.Fatal("guest should browse all decks")
	}
	if RoleMember.CanBrowseAllDecks() {
		t.Fatal("member should not browse all decks")
	}
	if !RoleAdmin.CanBrowseAllDecks() {
		t.Fatal("admin should browse all decks")
	}
	if RoleGuest.CanAccessCardRaterResource() {
		t.Fatal("guest should not access card rater resource")
	}
	if !RoleMember.CanWriteContent() {
		t.Fatal("member should write content")
	}
	if !RoleAdmin.CanWriteContent() {
		t.Fatal("admin should write content")
	}
	if !RoleGuest.Valid() {
		t.Fatal("guest should be a valid role")
	}
}
