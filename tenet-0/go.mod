module github.com/overnightdesk/tenet-0

go 1.25.0

// Feature 49 substrate. Local replace so this module always builds against
// the in-tree bus-go, not whatever happens to be tagged at the published path.
// shared/bus-go is itself a separate module (Feature 49 publishes it
// independently for cross-language alignment with bus-ts).
replace github.com/overnightdesk/tenet-0/shared/bus-go => ./shared/bus-go

require (
	github.com/jackc/pgx/v5 v5.9.2
	github.com/mark3labs/mcp-go v0.48.0
	github.com/pashagolub/pgxmock/v3 v3.4.0
	github.com/prometheus/client_golang v1.23.2
	github.com/prometheus/client_model v0.6.2
	gopkg.in/yaml.v3 v3.0.1
)

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/fsnotify/fsnotify v1.9.0 // indirect
	github.com/gofrs/flock v0.13.0 // indirect
	github.com/google/jsonschema-go v0.4.2 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/overnightdesk/tenet-0/shared/bus-go v0.0.0-00010101000000-000000000000 // indirect
	github.com/prometheus/common v0.66.1 // indirect
	github.com/prometheus/procfs v0.16.1 // indirect
	github.com/santhosh-tekuri/jsonschema/v5 v5.3.1 // indirect
	github.com/spf13/cast v1.7.1 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	go.yaml.in/yaml/v2 v2.4.2 // indirect
	golang.org/x/sync v0.17.0 // indirect
	golang.org/x/sys v0.37.0 // indirect
	golang.org/x/text v0.29.0 // indirect
	google.golang.org/protobuf v1.36.8 // indirect
)
