package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/api"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/kanban"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/policy"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "titus_meeting_filer=failed safe_error_code=service_failed")
		os.Exit(1)
	}
}
func run(arguments []string) error {
	if len(arguments) == 0 {
		return errors.New("command_missing")
	}
	if arguments[0] != "serve" {
		return errors.New("command_invalid")
	}
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	configPath := flags.String("config", "/run/secrets/runtime.json", "runtime configuration")
	listen := flags.String("listen", ":8090", "private listen address")
	if err := flags.Parse(arguments[1:]); err != nil || flags.NArg() != 0 {
		return errors.New("arguments_invalid")
	}
	configuration, err := policy.Load(*configPath)
	if err != nil {
		return err
	}
	if !configuration.Enabled {
		return errors.New("service_disabled")
	}
	allowed := map[string]struct{}{"meeting-triage": {}}
	for _, route := range configuration.Routes {
		allowed[route.KanbanBoard] = struct{}{}
	}
	handler, err := api.NewHandler(configuration, kanban.Adapter{Binary: configuration.HermesBinary, AllowedBoards: allowed, Runner: kanban.ExecRunner{}}, time.Now)
	if err != nil {
		return err
	}
	server := &http.Server{Addr: *listen, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		_ = server.Shutdown(shutdown)
	}()
	err = server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
