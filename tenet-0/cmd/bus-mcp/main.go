// Package main is the entry point for tenet0-bus-mcp.
//
// This binary wraps shared/bus-go behind an MCP server so Director subagents
// can publish/query/walk-causality on the Feature 49 event bus without
// linking the bus client themselves. See spec FR-1 + plan §The 6 MCP Servers.
//
// STUB — Phase 1 Task 1.1 (skeleton only). Real implementation lands in
// Phase 2 Task 2.2 after tests in Task 2.1.
package main

import "fmt"

func main() {
	fmt.Println("tenet0-bus-mcp: stub — implementation in Phase 2")
}
