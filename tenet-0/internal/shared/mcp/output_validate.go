package mcp

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

// ValidateOutput is the production output-validation entry point used by
// runTool. It REPLACES the inlined minimal validator (RES-1) with a full
// JSON-Schema (draft 7 / 2020-12) implementation backed by
// santhosh-tekuri/jsonschema.
//
// Behaviour contract:
//   - Empty/nil schema       => no-op (nil error). Matches legacy semantics.
//   - Unparseable schema     => error (fail-closed). Matches legacy semantics.
//   - Valid schema, instance => returns nil if instance conforms, error
//     containing every violation otherwise.
//
// Compiled schemas are cached to avoid recompilation on the hot path.
func ValidateOutput(schema, instance json.RawMessage) error {
	if len(schema) == 0 {
		return nil
	}
	sch, err := compileSchema(schema)
	if err != nil {
		return fmt.Errorf("schema unparseable: %w", err)
	}
	var inst any
	if err := json.Unmarshal(instance, &inst); err != nil {
		return fmt.Errorf("instance not valid JSON: %w", err)
	}
	if err := sch.Validate(inst); err != nil {
		return fmt.Errorf("output schema violation: %w", err)
	}
	return nil
}

var (
	schemaCacheMu sync.RWMutex
	schemaCache   = map[string]*jsonschema.Schema{}
)

// compileSchema compiles a raw JSON-Schema fragment, caching by schema bytes.
func compileSchema(schema json.RawMessage) (*jsonschema.Schema, error) {
	key := string(schema)
	schemaCacheMu.RLock()
	if sch, ok := schemaCache[key]; ok {
		schemaCacheMu.RUnlock()
		return sch, nil
	}
	schemaCacheMu.RUnlock()

	c := jsonschema.NewCompiler()
	c.Draft = jsonschema.Draft2020
	if err := c.AddResource("inline.json", strings.NewReader(string(schema))); err != nil {
		return nil, err
	}
	sch, err := c.Compile("inline.json")
	if err != nil {
		return nil, err
	}
	schemaCacheMu.Lock()
	schemaCache[key] = sch
	schemaCacheMu.Unlock()
	return sch, nil
}
