package constitution

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// MinimumSupportedVersion is the lowest constitution version Feature 50's
// runtime accepts. Older files lack memory_access_matrix and memory_scrubber
// sections and would leave the President without the governance state it
// depends on.
const MinimumSupportedVersion = 2

// LoadFromFile reads and validates a constitution-rules.yaml. It enforces
// the Feature 50 requirements: version >= MinimumSupportedVersion AND
// the two new top-level sections are present. Backward-compat readers
// (the Feature 49 bus rule evaluator) ignore the new sections; this loader
// is strict on purpose because the President needs them.
func LoadFromFile(path string) (*File, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("constitution: read %s: %w", path, err)
	}

	var f File
	if err := yaml.Unmarshal(bytes, &f); err != nil {
		return nil, fmt.Errorf("constitution: parse %s: %w", path, err)
	}

	if f.Version < MinimumSupportedVersion {
		return nil, fmt.Errorf(
			"constitution: %s declares version %d; Feature 50 requires >= %d "+
				"(missing memory_access_matrix and memory_scrubber sections); "+
				"run the v1.1.0 amendment per .specify/specs/50-tenet0-director-runtime/research.md",
			path, f.Version, MinimumSupportedVersion,
		)
	}

	if f.MemoryAccessMatrix == nil || len(f.MemoryAccessMatrix) == 0 {
		return nil, fmt.Errorf("constitution: %s missing required memory_access_matrix section", path)
	}
	if f.MemoryScrubber == nil {
		return nil, fmt.Errorf("constitution: %s missing required memory_scrubber section", path)
	}
	if len(f.MemoryScrubber.Layers) == 0 {
		return nil, fmt.Errorf("constitution: %s memory_scrubber has no layers", path)
	}

	return &f, nil
}
