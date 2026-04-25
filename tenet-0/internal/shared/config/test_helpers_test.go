package config

import (
	"os"
	"testing"
)

func setenv(t *testing.T, k, v string) {
	t.Helper()
	if err := os.Setenv(k, v); err != nil {
		t.Fatalf("setenv %s=%s: %v", k, v, err)
	}
}

func unsetenv(t *testing.T, k string) {
	t.Helper()
	if err := os.Unsetenv(k); err != nil {
		t.Fatalf("unsetenv %s: %v", k, err)
	}
}

func getenvForRestore(k string) string {
	return os.Getenv(k)
}
