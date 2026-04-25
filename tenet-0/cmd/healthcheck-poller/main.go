// Package main is the entry point for tenet0-healthcheck-poller.
//
// Every 60s probes MCP-server liveness for each registered Director via the
// `<mcp-binary> --healthcheck` subprocess pattern (RES-4 resolution). State
// transitions only published as *.lifecycle.degraded/recovered events. See
// spec FR-18/19 + plan §The 4 Daemons.
//
// STUB — Phase 1 Task 1.1. Real impl in Phase 3 Task 3.4.
package main

import "fmt"

func main() {
	fmt.Println("tenet0-healthcheck-poller: stub — implementation in Phase 3")
}
