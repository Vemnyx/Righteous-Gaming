package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/log"
)

type mailHTTP struct {
	app *app.App
}

type sendEmailRequest struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	Content string `json:"content"`
}

func (h *mailHTTP) sendEmail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	const maxBody = 1 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)

	var body sendEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	to := strings.TrimSpace(body.To)
	if to == "" {
		http.Error(w, `field "to" is required`, http.StatusBadRequest)
		return
	}

	if err := h.app.SendGmail(r.Context(), to, strings.TrimSpace(body.Subject), body.Content); err != nil {
		log.Error("send email", "error", err)
		http.Error(w, "failed to send email", http.StatusBadGateway)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
