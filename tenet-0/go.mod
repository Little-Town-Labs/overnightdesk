module github.com/overnightdesk/tenet-0

go 1.25.0

// Feature 49 substrate. Local replace so this module always builds against
// the in-tree bus-go, not whatever happens to be tagged at the published path.
// shared/bus-go is itself a separate module (Feature 49 publishes it
// independently for cross-language alignment with bus-ts).
replace github.com/overnightdesk/tenet-0/shared/bus-go => ./shared/bus-go

require github.com/overnightdesk/tenet-0/shared/bus-go v0.0.0-00010101000000-000000000000

require gopkg.in/yaml.v3 v3.0.1 // indirect
