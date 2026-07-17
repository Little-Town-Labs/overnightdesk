package transport

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type Message struct {
	InboxID       string            `json:"inbox_id"`
	ThreadID      string            `json:"thread_id"`
	MessageID     string            `json:"message_id"`
	Labels        []string          `json:"labels"`
	Timestamp     string            `json:"timestamp"`
	From          string            `json:"from"`
	To            []string          `json:"to"`
	Subject       string            `json:"subject"`
	Preview       string            `json:"preview"`
	Text          string            `json:"text"`
	ExtractedText string            `json:"extracted_text"`
	Headers       map[string]string `json:"headers"`
	InReplyTo     string            `json:"in_reply_to"`
}

func (message Message) BodyExcerpt(limit int) string {
	for _, value := range []string{message.ExtractedText, message.Text, message.Preview} {
		if value != "" {
			if len(value) > limit {
				return value[:limit]
			}
			return value
		}
	}
	return ""
}

type ListResponse struct {
	Count         int       `json:"count"`
	Messages      []Message `json:"messages"`
	NextPageToken string    `json:"next_page_token"`
}

type Draft struct {
	DraftID    string   `json:"draft_id"`
	ClientID   string   `json:"client_id"`
	To         []string `json:"to"`
	Subject    string   `json:"subject"`
	Text       string   `json:"text"`
	HTML       string   `json:"html"`
	InReplyTo  string   `json:"in_reply_to"`
	SendStatus string   `json:"send_status"`
}

type CreateDraftRequest struct {
	To        []string `json:"to,omitempty"`
	Subject   string   `json:"subject,omitempty"`
	Text      string   `json:"text"`
	HTML      string   `json:"html,omitempty"`
	InReplyTo string   `json:"in_reply_to,omitempty"`
	ClientID  string   `json:"client_id"`
}

type SendResult struct {
	MessageID string `json:"message_id"`
	ThreadID  string `json:"thread_id"`
}

type AgentMailClient struct {
	api     jsonClient
	inboxID string
}

func NewAgentMailClient(baseURL, token, inboxID string, timeout time.Duration) *AgentMailClient {
	return &AgentMailClient{api: newJSONClient(baseURL, token, timeout), inboxID: url.PathEscape(inboxID)}
}

func (client *AgentMailClient) ListMessages(pageToken string, limit int) (ListResponse, error) {
	query := url.Values{
		"limit":                   []string{strconv.Itoa(limit)},
		"include_blocked":         []string{"true"},
		"include_unauthenticated": []string{"true"},
	}
	if pageToken != "" {
		query.Set("page_token", pageToken)
	}
	var result ListResponse
	err := client.api.do(http.MethodGet, fmt.Sprintf("/inboxes/%s/messages?%s", client.inboxID, query.Encode()), nil, &result)
	return result, err
}

func (client *AgentMailClient) GetMessage(messageID string) (Message, error) {
	var result Message
	err := client.api.do(http.MethodGet, fmt.Sprintf("/inboxes/%s/messages/%s", client.inboxID, url.PathEscape(messageID)), nil, &result)
	return result, err
}

func (client *AgentMailClient) CreateDraft(request CreateDraftRequest) (Draft, error) {
	if request.HTML == "" && request.Text != "" {
		request.HTML = plainTextHTML(request.Text)
	}
	path := fmt.Sprintf("/inboxes/%s/drafts", client.inboxID)
	payload := request
	if request.InReplyTo != "" {
		path = fmt.Sprintf(
			"/inboxes/%s/messages/%s/draft-reply", client.inboxID, url.PathEscape(request.InReplyTo),
		)
		payload.InReplyTo = ""
	}
	var result Draft
	err := client.api.do(http.MethodPost, path, payload, &result)
	return result, err
}

func (client *AgentMailClient) Reply(messageID, text string) (SendResult, error) {
	payload := struct {
		Text string `json:"text"`
		HTML string `json:"html"`
	}{Text: text, HTML: plainTextHTML(text)}
	var result SendResult
	err := client.api.doWithHeaders(
		http.MethodPost,
		fmt.Sprintf("/inboxes/%s/messages/%s/reply", client.inboxID, url.PathEscape(messageID)),
		payload, &result,
		map[string]string{"Idempotency-Key": idempotencyKey("reply", client.inboxID, messageID)},
	)
	return result, err
}

func (client *AgentMailClient) GetDraft(draftID string) (Draft, error) {
	var result Draft
	err := client.api.do(http.MethodGet, fmt.Sprintf("/inboxes/%s/drafts/%s", client.inboxID, url.PathEscape(draftID)), nil, &result)
	return result, err
}

func (client *AgentMailClient) SendDraft(draftID string) (SendResult, error) {
	var result SendResult
	err := client.api.doWithHeaders(
		http.MethodPost, fmt.Sprintf("/inboxes/%s/drafts/%s/send", client.inboxID, url.PathEscape(draftID)),
		struct{}{}, &result, map[string]string{"Idempotency-Key": idempotencyKey("draft-send", client.inboxID, draftID)},
	)
	return result, err
}

func idempotencyKey(kind, inboxID, remoteID string) string {
	digest := sha256.Sum256([]byte("titus-" + kind + "-v1\x00" + inboxID + "\x00" + remoteID))
	return "titus-" + kind + "-" + hex.EncodeToString(digest[:16])
}

func plainTextHTML(text string) string {
	return `<div style="white-space:pre-wrap">` + html.EscapeString(text) + `</div>`
}
