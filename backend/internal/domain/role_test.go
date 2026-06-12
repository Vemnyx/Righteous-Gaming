package domain

import "testing"

func TestRoleGuestPermissions(t *testing.T) {
	if RoleGuest.CanWriteContent() {
		t.Fatal("guest should not write content")
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
