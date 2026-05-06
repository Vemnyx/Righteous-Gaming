package emailtemplates

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
)

//go:embed *.html
var templateFS embed.FS

var adminRegisterInviteTemplate = template.Must(
	template.ParseFS(templateFS, "admin_register_invite.html"),
)

type adminRegisterInviteData struct {
	RegisterURL string
}

func RenderAdminRegisterInvite(registerURL string) (string, error) {
	var out bytes.Buffer
	if err := adminRegisterInviteTemplate.Execute(&out, adminRegisterInviteData{RegisterURL: registerURL}); err != nil {
		return "", fmt.Errorf("email templates: render admin register invite: %w", err)
	}
	return out.String(), nil
}
