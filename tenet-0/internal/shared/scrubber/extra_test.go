package scrubber

import (
	"strings"
	"testing"

	"github.com/overnightdesk/tenet-0/internal/shared/constitution"
)

func TestMustScan_NilPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("MustScan on nil should panic")
		}
	}()
	var s *Scrubber
	_ = s.MustScan("x")
}

func TestMustScan_NonNilDelegates(t *testing.T) {
	s := mustNew(t)
	r := s.MustScan("hello world")
	if !r.Clean {
		t.Errorf("MustScan flagged benign text: %+v", r.Hits)
	}
}

func TestNew_DropsDisabledLayers(t *testing.T) {
	cfg := canonicalConfig()
	for i := range cfg.Layers {
		if cfg.Layers[i].Name == LayerHighEntropy {
			cfg.Layers[i].Enabled = false
		}
	}
	s, err := New(cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	// 60-char high-entropy token should now slip through.
	r := s.Scan("xQ7p9LmZ2vBnK4tR8sYwE6cFhJgUaIdN3oVpQwErTyUiOpAsDfGhJkLzXcVbNm")
	for _, h := range r.Hits {
		if h.LayerName == LayerHighEntropy {
			t.Errorf("disabled high_entropy layer still ran: %+v", h)
		}
	}
}

func TestExcerpt_BoundaryAndLong(t *testing.T) {
	short := excerpt("abc")
	if short != "abc" {
		t.Errorf("short excerpt = %q", short)
	}
	long := excerpt(strings.Repeat("A", 100))
	if !strings.HasSuffix(long, "...") {
		t.Errorf("long excerpt missing suffix: %q", long)
	}
	if len(long) != MaxExcerpt+3 {
		t.Errorf("long excerpt length = %d, want %d", len(long), MaxExcerpt+3)
	}
}

func TestLuhn_KnownCases(t *testing.T) {
	cases := []struct {
		s    string
		want bool
	}{
		{"4111111111111111", true},
		{"4111111111111112", false},
		{"5555555555554444", true},
		{"0", true},
	}
	for _, c := range cases {
		if got := luhnValid(c.s); got != c.want {
			t.Errorf("luhnValid(%q) = %v, want %v", c.s, got, c.want)
		}
	}
}

func TestShannonEntropy_EmptyAndUniform(t *testing.T) {
	if shannonEntropy("") != 0 {
		t.Error("empty entropy should be 0")
	}
	if h := shannonEntropy("aaaa"); h != 0 {
		t.Errorf("uniform entropy = %v, want 0", h)
	}
}

func TestRot13_RoundTrip(t *testing.T) {
	in := "Hello, Cyrillic 0123!"
	if rot13(rot13(in)) != in {
		t.Error("rot13 not involutive")
	}
}

func TestFoldConfusables_NoOpOnLatin(t *testing.T) {
	if foldConfusables("plain ascii") != "plain ascii" {
		t.Error("fold mutated plain ascii")
	}
}

func TestIsValidUTF8Printable_Cases(t *testing.T) {
	if isValidUTF8Printable(nil) {
		t.Error("nil should be non-printable")
	}
	if !isValidUTF8Printable([]byte("ok")) {
		t.Error("ok should be printable")
	}
	if isValidUTF8Printable([]byte{0x01, 0x02}) {
		t.Error("control bytes should be non-printable")
	}
}

func TestNew_UnknownLayerDetail(t *testing.T) {
	cfg := constitution.ScrubberConfig{
		Version: 1,
		Layers:  []constitution.ScrubberLayer{{Name: "no_such_thing", Enabled: true}},
	}
	_, err := New(cfg)
	if err == nil || !strings.Contains(err.Error(), "no_such_thing") {
		t.Errorf("err = %v, want detail mentioning layer name", err)
	}
}

func TestMin_Boundary(t *testing.T) {
	if min(2, 1) != 1 {
		t.Error("min(2,1) wrong")
	}
	if min(1, 2) != 1 {
		t.Error("min(1,2) wrong")
	}
}

func TestScan_AcceptsNilHits(t *testing.T) {
	// Direct candidate paths — exercise matchAll dedupe path.
	hits := matchAll([]string{"a@b.co", "a@b.co"}, emailRe, 1, "x", "r")
	if len(hits) != 1 {
		t.Errorf("matchAll dedupe failed: %d", len(hits))
	}
}
