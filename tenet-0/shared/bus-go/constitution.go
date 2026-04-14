package bus

import (
	"context"
	"fmt"
	"time"
)

// Constitution returns the Constitution view of this Bus.
func (b *Bus) Constitution() *Constitution {
	return &Constitution{bus: b}
}

// Constitution exposes the active versioned constitution and a Watch
// callback for hot-reloading agent prompts when the constitution is bumped.
type Constitution struct {
	bus *Bus
}

// LoadedConstitution is the active constitution as seen by an agent.
type LoadedConstitution struct {
	VersionID int64
	ProseText string
	RulesYAML string
	Rules     []ConstitutionRule
}

// ConstitutionRule is one parsed rule from the active constitution.
type ConstitutionRule struct {
	RuleID               string
	EventTypePattern     string
	RequiresApprovalMode string // "per_action", "blanket_category", "none", or ""
	ApprovalCategory     string
}

// Load returns the currently active constitution. Agents call this at startup
// (and on each Watch callback) to embed the constitution into their system
// prompt.
func (c *Constitution) Load(ctx context.Context) (*LoadedConstitution, error) {
	var loaded LoadedConstitution
	err := c.bus.pool.QueryRow(ctx,
		`SELECT version_id, prose_text, rules_yaml
		   FROM constitution_versions WHERE is_active LIMIT 1`,
	).Scan(&loaded.VersionID, &loaded.ProseText, &loaded.RulesYAML)
	if err != nil {
		return nil, fmt.Errorf("constitution: load: %w", err)
	}

	rows, err := c.bus.pool.Query(ctx,
		`SELECT rule_id, event_type_pattern,
		        COALESCE(requires_approval_mode, ''),
		        COALESCE(approval_category, '')
		   FROM constitution_rules
		  WHERE constitution_version_id = $1
		  ORDER BY id`,
		loaded.VersionID,
	)
	if err != nil {
		return nil, fmt.Errorf("constitution: load rules: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var r ConstitutionRule
		if err := rows.Scan(&r.RuleID, &r.EventTypePattern, &r.RequiresApprovalMode, &r.ApprovalCategory); err != nil {
			return nil, fmt.Errorf("constitution: scan rule: %w", err)
		}
		loaded.Rules = append(loaded.Rules, r)
	}
	return &loaded, rows.Err()
}

// CurrentVersion returns the active version_id without loading prose/rules.
// Cheap; safe to call from a polling loop.
func (c *Constitution) CurrentVersion(ctx context.Context) (int64, error) {
	var v int64
	err := c.bus.pool.QueryRow(ctx,
		`SELECT version_id FROM constitution_versions WHERE is_active LIMIT 1`,
	).Scan(&v)
	if err != nil {
		return 0, fmt.Errorf("constitution: current version: %w", err)
	}
	return v, nil
}

// Watch polls CurrentVersion at the given interval and invokes onChange with
// the new version whenever it changes. Returns a stop function the caller
// invokes to cancel the watcher; the watcher also stops when ctx is done.
//
// onChange is invoked synchronously inside the polling goroutine — a slow
// callback delays detection of the next change. Offload to a goroutine if
// the work may exceed interval.
//
// Each agent's loop should call Load() inside onChange to refresh its prompt
// at the next task boundary.
//
// To prevent runaway polling from misconfigured callers (test intervals
// leaking into production), the minimum effective interval is 1 second.
func (c *Constitution) Watch(ctx context.Context, interval time.Duration, onChange func(newVersion int64)) (stop func(), err error) {
	if interval <= 0 {
		return nil, fmt.Errorf("constitution: watch interval must be positive")
	}
	const minInterval = 1 * time.Second
	if interval < minInterval {
		c.bus.logger.Warn("constitution: watch interval below minimum, clamping",
			"requested", interval, "effective", minInterval)
		interval = minInterval
	}

	current, err := c.CurrentVersion(ctx)
	if err != nil {
		return nil, err
	}

	watchCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})

	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-watchCtx.Done():
				return
			case <-ticker.C:
				v, err := c.CurrentVersion(watchCtx)
				if err != nil {
					if watchCtx.Err() != nil {
						return
					}
					c.bus.logger.Warn("constitution: watch poll failed", "error", err)
					continue
				}
				if v != current {
					current = v
					onChange(v)
				}
			}
		}
	}()

	return func() { cancel(); <-done }, nil
}
