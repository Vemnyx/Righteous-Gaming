package domain

import "testing"

func TestRoleGuestPermissions(t *testing.T) {
	if RoleGuest.CanWriteContent() {
		t.Fatal("guest should not write content")
	}
	if RoleGuest.CanWriteDecksAndRecordings() {
		t.Fatal("guest should not write decks or recordings")
	}
	if RoleGuest.CanBrowseAllDecks() {
		t.Fatal("guest should not browse all decks")
	}
	if RoleGuest.CanAccessData() {
		t.Fatal("guest should not access data")
	}
	if RoleGuest.CanAccessCardRaterResource() {
		t.Fatal("guest should not access card rater resource")
	}
	if RoleGuest.CanAccessMeetings() {
		t.Fatal("guest should not access meetings")
	}
	if !RoleGuest.Valid() {
		t.Fatal("guest should be a valid role")
	}
	if RoleGuest.CountsForTeamSnapshot() {
		t.Fatal("guest should not count for team snapshot")
	}
}

func TestRolePlayTesterPermissions(t *testing.T) {
	if RolePlayTester.CanWriteContent() {
		t.Fatal("play tester should not write general content")
	}
	if !RolePlayTester.CanWriteDecksAndRecordings() {
		t.Fatal("play tester should write decks and recordings")
	}
	if !RolePlayTester.CanBrowseAllDecks() {
		t.Fatal("play tester should browse all decks")
	}
	if !RolePlayTester.CanAccessData() {
		t.Fatal("play tester should access data")
	}
	if RolePlayTester.CanAccessCardRaterResource() {
		t.Fatal("play tester should not access card rater resource")
	}
	if !RolePlayTester.CanAccessMeetings() {
		t.Fatal("play tester should access meetings")
	}
	if !RolePlayTester.Valid() {
		t.Fatal("play tester should be a valid role")
	}
	if !RolePlayTester.CountsForTeamSnapshot() {
		t.Fatal("play tester should count for team snapshot")
	}
}

func TestRoleMemberAndAdminPermissions(t *testing.T) {
	if RoleMember.CanBrowseAllDecks() {
		t.Fatal("member should not browse all decks")
	}
	if !RoleAdmin.CanBrowseAllDecks() {
		t.Fatal("admin should browse all decks")
	}
	if !RoleMember.CanWriteContent() {
		t.Fatal("member should write content")
	}
	if !RoleAdmin.CanWriteContent() {
		t.Fatal("admin should write content")
	}
	if !RoleMember.CanWriteDecksAndRecordings() {
		t.Fatal("member should write decks and recordings")
	}
	if !RoleAdmin.CanWriteDecksAndRecordings() {
		t.Fatal("admin should write decks and recordings")
	}
	if !RoleMember.CanAccessData() {
		t.Fatal("member should access data")
	}
	if !RoleAdmin.CanAccessData() {
		t.Fatal("admin should access data")
	}
	if !RoleMember.CanAccessMeetings() {
		t.Fatal("member should access meetings")
	}
	if !RoleAdmin.CanAccessMeetings() {
		t.Fatal("admin should access meetings")
	}
	if !RoleMember.CountsForTeamSnapshot() {
		t.Fatal("member should count for team snapshot")
	}
	if !RoleAdmin.CountsForTeamSnapshot() {
		t.Fatal("admin should count for team snapshot")
	}
}
