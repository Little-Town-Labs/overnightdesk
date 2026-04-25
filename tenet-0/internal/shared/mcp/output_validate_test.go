package mcp

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestValidateOutput_NilSchemaIsNoOp(t *testing.T) {
	if err := ValidateOutput(nil, json.RawMessage(`{}`)); err != nil {
		t.Errorf("nil schema should be no-op: %v", err)
	}
	if err := ValidateOutput(json.RawMessage{}, json.RawMessage(`{}`)); err != nil {
		t.Errorf("empty schema should be no-op: %v", err)
	}
}

func TestValidateOutput_UnparseableSchema(t *testing.T) {
	err := ValidateOutput(json.RawMessage(`not-json`), json.RawMessage(`{}`))
	if err == nil || !strings.Contains(err.Error(), "schema unparseable") {
		t.Errorf("got %v", err)
	}
}

func TestValidateOutput_InstanceNotJSON(t *testing.T) {
	err := ValidateOutput(json.RawMessage(`{"type":"object"}`), json.RawMessage(`<<not-json>>`))
	if err == nil {
		t.Error("expected error on bad instance JSON")
	}
}

func TestValidateOutput_RequiredFieldMissing(t *testing.T) {
	schema := json.RawMessage(`{"type":"object","required":["x"],"properties":{"x":{"type":"string"}}}`)
	if err := ValidateOutput(schema, json.RawMessage(`{}`)); err == nil {
		t.Error("missing required field should fail")
	}
}

func TestValidateOutput_TypeMismatch(t *testing.T) {
	schema := json.RawMessage(`{"type":"object","properties":{"n":{"type":"integer"}}}`)
	if err := ValidateOutput(schema, json.RawMessage(`{"n":"not-a-number"}`)); err == nil {
		t.Error("integer property given string should fail")
	}
}

func TestValidateOutput_HappyPath(t *testing.T) {
	schema := json.RawMessage(`{"type":"object","required":["n"],"properties":{"n":{"type":"integer"}}}`)
	if err := ValidateOutput(schema, json.RawMessage(`{"n":7}`)); err != nil {
		t.Errorf("valid instance: %v", err)
	}
}

func TestValidateOutput_CacheHit(t *testing.T) {
	// Same schema bytes should hit the cache on the second call.
	schema := json.RawMessage(`{"type":"object","required":["n"],"properties":{"n":{"type":"integer"}}}`)
	if err := ValidateOutput(schema, json.RawMessage(`{"n":1}`)); err != nil {
		t.Fatal(err)
	}
	if err := ValidateOutput(schema, json.RawMessage(`{"n":2}`)); err != nil {
		t.Fatal(err)
	}
}

func TestValidateOutput_NestedShapes(t *testing.T) {
	schema := json.RawMessage(`{
		"type":"object",
		"properties":{
			"items":{"type":"array","items":{"type":"string"}}
		}
	}`)
	if err := ValidateOutput(schema, json.RawMessage(`{"items":["a","b"]}`)); err != nil {
		t.Errorf("happy nested: %v", err)
	}
	if err := ValidateOutput(schema, json.RawMessage(`{"items":["a",1]}`)); err == nil {
		t.Error("type mismatch in array element not detected")
	}
}
