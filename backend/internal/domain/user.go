package domain

import "time"

// Role identifies the user's role in the application (stored as integer in the database).
// 0 = admin, 1 = member (default for new users).
type Role int

const (
	RoleAdmin  Role = 0
	RoleMember Role = 1
)

// Valid reports whether r is a known role constant.
func (r Role) Valid() bool {
	switch r {
	case RoleAdmin, RoleMember:
		return true
	default:
		return false
	}
}

// UserSettings holds per-user app preferences (from user_settings).
type UserSettings struct {
	CardRaterQuickSubmit bool `json:"card_rater_quick_submit"`
}

// User mirrors persisted user fields and supports JSON request/response bodies.
// For create requests, omit "role" or send null to default to member (RoleMember).
// Using *Role allows omit vs zero (which would otherwise imply RoleAdmin).
type User struct {
	ID        int        `json:"id,omitempty"`
	Email     string     `json:"email"`
	Username  *string    `json:"username,omitempty"`
	FirstName *string    `json:"first_name,omitempty"`
	LastName  *string    `json:"last_name,omitempty"`
	UID       string     `json:"uid"`
	Role      *Role      `json:"role,omitempty"`
	CreatedAt *time.Time `json:"created_at,omitempty"`
	Settings  UserSettings `json:"settings"`
}

// UserMeSettings combines app preferences with profile fields stored on users.
type UserMeSettings struct {
	Settings  UserSettings `json:"settings"`
	FirstName *string      `json:"first_name,omitempty"`
	LastName  *string      `json:"last_name,omitempty"`
}
