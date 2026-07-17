package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DirtyEmail struct {
	RouteID           string
	InboxID           string
	TargetAgent       string
	ProviderMessageID string
	ThreadID          string
	InReplyTo         string
	Body              string
	Sender            string
	Subject           string
	ReceivedAt        time.Time
	SenderAuthorized  bool
}

type CleanEmail struct {
	ID                string
	StagingID         string
	ProviderMessageID string
	ThreadID          string
	SafeContent       string
}

type Repository interface {
	LandDirty(context.Context, DirtyEmail) (bool, error)
	ClaimClean(context.Context, string, string, string, int) ([]CleanEmail, error)
	Complete(context.Context, string, string, string, string) (bool, error)
	Fail(context.Context, string, string, string, string, string) (bool, error)
}

type Postgres struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Postgres, error) {
	configuration, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database configuration: %w", err)
	}
	configuration.MaxConns = 2
	pool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Postgres{pool: pool}, nil
}

func (repository *Postgres) Close() { repository.pool.Close() }

const landDirtySQL = `
INSERT INTO content_staging
  (source, content_type, message_id, body, sender, subject, metadata, received_at)
VALUES
  ('agentmail', 'text', $1, $2, $3, $4, $5, $6)
ON CONFLICT (source, message_id) DO NOTHING`

func (repository *Postgres) LandDirty(ctx context.Context, email DirtyEmail) (bool, error) {
	metadata, err := dirtyMetadata(email)
	if err != nil {
		return false, err
	}
	result, err := repository.pool.Exec(ctx, landDirtySQL,
		email.InboxID+":"+email.ProviderMessageID, email.Body, email.Sender,
		email.Subject, metadata, email.ReceivedAt,
	)
	if err != nil {
		return false, fmt.Errorf("land dirty email: %w", err)
	}
	return result.RowsAffected() == 1, nil
}

func dirtyMetadata(email DirtyEmail) ([]byte, error) {
	if email.RouteID == "" || email.InboxID == "" || email.TargetAgent == "" || email.ProviderMessageID == "" {
		return nil, errors.New("dirty email route metadata is incomplete")
	}
	return json.Marshal(map[string]any{
		"schema_version":      1,
		"provider":            "agentmail",
		"route_id":            email.RouteID,
		"inbox_id":            email.InboxID,
		"target_agent":        email.TargetAgent,
		"provider_message_id": email.ProviderMessageID,
		"thread_id":           email.ThreadID,
		"in_reply_to":         email.InReplyTo,
		"sender_authorized":   email.SenderAuthorized,
	})
}

const claimCleanSQL = `
WITH candidate AS (
  SELECT im.id
  FROM ingested_messages im
  JOIN content_staging cs ON cs.id = im.staging_id
  WHERE im.source = 'agentmail'
    AND cs.source = 'agentmail'
    AND cs.metadata->>'provider' = 'agentmail'
    AND im.approval_status IN ('approved', 'auto_approved')
    AND im.agent_zero_status = 'queued'
    AND COALESCE(BTRIM(im.safe_content), '') <> ''
    AND COALESCE(cs.metadata->>'provider_message_id', '') <> ''
    AND cs.metadata->>'route_id' = $1
    AND cs.metadata->>'inbox_id' = $2
    AND cs.metadata->>'target_agent' = $3
    AND cs.metadata->>'sender_authorized' = 'true'
  ORDER BY im.created_at ASC
  FOR UPDATE OF im SKIP LOCKED
  LIMIT $4
)
UPDATE ingested_messages im
SET agent_zero_status = 'processing', agent_zero_run_at = NOW(), agent_zero_error = NULL
FROM candidate c, content_staging cs
WHERE im.id = c.id AND cs.id = im.staging_id
RETURNING im.id::text, im.staging_id::text,
  cs.metadata->>'provider_message_id', COALESCE(cs.metadata->>'thread_id', ''), im.safe_content`

func (repository *Postgres) ClaimClean(ctx context.Context, routeID, inboxID, targetAgent string, limit int) ([]CleanEmail, error) {
	rows, err := repository.pool.Query(ctx, claimCleanSQL, routeID, inboxID, targetAgent, limit)
	if err != nil {
		return nil, fmt.Errorf("claim clean email: %w", err)
	}
	defer rows.Close()
	emails := make([]CleanEmail, 0, limit)
	for rows.Next() {
		var email CleanEmail
		if err := rows.Scan(&email.ID, &email.StagingID, &email.ProviderMessageID, &email.ThreadID, &email.SafeContent); err != nil {
			return nil, fmt.Errorf("scan clean email: %w", err)
		}
		emails = append(emails, email)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read clean emails: %w", err)
	}
	return emails, nil
}

const updateCleanSQL = `
UPDATE ingested_messages im
SET agent_zero_status = $5, agent_zero_error = $6, agent_zero_run_at = NOW()
FROM content_staging cs
WHERE im.id::text = $1 AND cs.id = im.staging_id
  AND cs.metadata->>'route_id' = $2
  AND cs.metadata->>'inbox_id' = $3
  AND cs.metadata->>'target_agent' = $4
  AND (im.agent_zero_status = 'processing'
    OR ($5 = 'done' AND im.agent_zero_status = 'done'))`

func (repository *Postgres) Complete(ctx context.Context, cleanID, routeID, inboxID, targetAgent string) (bool, error) {
	return repository.update(ctx, cleanID, routeID, inboxID, targetAgent, "done", nil)
}

func (repository *Postgres) Fail(ctx context.Context, cleanID, routeID, inboxID, targetAgent, code string) (bool, error) {
	if len(code) > 128 {
		code = code[:128]
	}
	return repository.update(ctx, cleanID, routeID, inboxID, targetAgent, "error", code)
}

func (repository *Postgres) update(ctx context.Context, cleanID, routeID, inboxID, targetAgent, status string, detail any) (bool, error) {
	result, err := repository.pool.Exec(ctx, updateCleanSQL, cleanID, routeID, inboxID, targetAgent, status, detail)
	if err != nil {
		return false, fmt.Errorf("update clean email: %w", err)
	}
	return result.RowsAffected() == 1, nil
}
