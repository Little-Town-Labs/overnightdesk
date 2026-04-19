package constitution

import (
	"os"
)

func writeTemp(body string) (string, error) {
	f, err := os.CreateTemp("", "constitution-*.yaml")
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.WriteString(body); err != nil {
		return "", err
	}
	return f.Name(), nil
}

func removeTemp(path string) error {
	return os.Remove(path)
}
