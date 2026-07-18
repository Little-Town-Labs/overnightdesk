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
			return boundText(value, limit)
		}
	}
	return ""
}

type ListResponse struct {
	Count         int       `json:"count"`
	Messages      []Message `json:"messages"`
	NextPageToken string    `json:"next_page_token"`
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

func (client *AgentMailClient) Reply(messageID, text, purpose string) (SendResult, error) {
	payload := struct {
		Text string `json:"text"`
		HTML string `json:"html"`
	}{Text: text, HTML: plainTextHTML(text)}
	var result SendResult
	err := client.api.doWithHeaders(
		http.MethodPost,
		fmt.Sprintf("/inboxes/%s/messages/%s/reply", client.inboxID, url.PathEscape(messageID)),
		payload, &result,
		map[string]string{"Idempotency-Key": idempotencyKey("reply-"+purpose, client.inboxID, messageID)},
	)
	if err == nil && result.MessageID == "" {
		err = fmt.Errorf("invalid AgentMail reply response")
	}
	return result, err
}

func boundText(value string, maximum int) string {
	if maximum < 1 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= maximum {
		return value
	}
	return string(runes[:maximum])
}

func idempotencyKey(kind, inboxID, remoteID string) string {
	digest := sha256.Sum256([]byte("titus-" + kind + "-v1\x00" + inboxID + "\x00" + remoteID))
	return "titus-" + kind + "-" + hex.EncodeToString(digest[:16])
}

func plainTextHTML(text string) string {
	return `<div style="white-space:pre-wrap">` + html.EscapeString(text) + `</div>`
}
