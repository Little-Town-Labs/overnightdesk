package scrubber

import (
	"encoding/base64"
	"fmt"
	"math"
	"regexp"
	"strings"

	"golang.org/x/text/unicode/norm"

	"github.com/overnightdesk/tenet-0/internal/shared/constitution"
)

// known layer set for fail-closed validation.
var knownLayers = map[string]struct{}{
	LayerUnicodeNormalize:       {},
	LayerEncodingDecode:         {},
	LayerCustomerEmail:          {},
	LayerCreditCard:             {},
	LayerAnthropicCredential:    {},
	LayerAWSAccessKey:           {},
	LayerConversationTranscript: {},
	LayerHighEntropy:            {},
}

// Compiled patterns. Crafted to avoid catastrophic backtracking; bounded
// repetitions and simple character classes only.
var (
	emailRe        = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	creditCardRe   = regexp.MustCompile(`\b(?:\d[ -]?){12,18}\d\b`)
	anthropicRe    = regexp.MustCompile(`sk-ant-[A-Za-z0-9_\-]{20,}`)
	awsKeyRe       = regexp.MustCompile(`AKIA[0-9A-Z]{16}`)
	uuidRe         = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	highEntropyRun = regexp.MustCompile(`[A-Za-z0-9+/=_\-]{32,}`)
	transcriptRe   = regexp.MustCompile(`(?i)\b(customer|tenant|user|assistant|agent)\s*:`)
)

// layerFn is the per-layer execution closure. Returns hits found.
type layerFn func(candidates []string) []Hit

// activeLayer pairs a layer's 1-based pipeline position with its fn and name.
type activeLayer struct {
	pos  int
	name string
	exec layerFn
}

// Scrubber runs the configured detection pipeline against arbitrary text.
// It is safe for concurrent use after construction; New finalizes the
// pipeline and the resulting *Scrubber is read-only.
//
// (Re-declared here without the stub field to keep types.go clean.)
type scrubberImpl struct {
	layers []activeLayer
	// preprocess flags: do we need NFKC normalize / encoding decode?
	doNormalize bool
	doDecode    bool
}

// New constructs a Scrubber from the constitution-loaded ScrubberConfig.
func New(cfg constitution.ScrubberConfig) (*Scrubber, error) {
	if len(cfg.Layers) == 0 {
		return nil, ErrEmptyConfig
	}
	for _, l := range cfg.Layers {
		if _, ok := knownLayers[l.Name]; !ok {
			return nil, fmt.Errorf("%w: %q", ErrUnknownLayer, l.Name)
		}
	}

	impl := &scrubberImpl{}
	pos := 0
	for _, l := range cfg.Layers {
		if !l.Enabled {
			continue
		}
		pos++
		switch l.Name {
		case LayerUnicodeNormalize:
			impl.doNormalize = true
			impl.layers = append(impl.layers, activeLayer{pos, l.Name, func(_ []string) []Hit { return nil }})
		case LayerEncodingDecode:
			impl.doDecode = true
			impl.layers = append(impl.layers, activeLayer{pos, l.Name, func(_ []string) []Hit { return nil }})
		case LayerCustomerEmail:
			p := pos
			impl.layers = append(impl.layers, activeLayer{p, l.Name, func(cands []string) []Hit {
				return matchAll(cands, emailRe, p, l.Name, "email pattern matched")
			}})
		case LayerCreditCard:
			p := pos
			impl.layers = append(impl.layers, activeLayer{p, l.Name, func(cands []string) []Hit {
				var hits []Hit
				for _, c := range cands {
					for _, m := range creditCardRe.FindAllString(c, -1) {
						digits := stripNonDigits(m)
						if len(digits) >= 13 && len(digits) <= 19 && luhnValid(digits) {
							hits = append(hits, Hit{Layer: p, LayerName: l.Name, Reason: "luhn-valid card-shaped digit run", Excerpt: excerpt(m)})
						}
					}
				}
				return hits
			}})
		case LayerAnthropicCredential:
			p := pos
			impl.layers = append(impl.layers, activeLayer{p, l.Name, func(cands []string) []Hit {
				return matchAll(cands, anthropicRe, p, l.Name, "anthropic key shape matched")
			}})
		case LayerAWSAccessKey:
			p := pos
			impl.layers = append(impl.layers, activeLayer{p, l.Name, func(cands []string) []Hit {
				return matchAll(cands, awsKeyRe, p, l.Name, "aws access key shape matched")
			}})
		case LayerConversationTranscript:
			p := pos
			impl.layers = append(impl.layers, activeLayer{p, l.Name, func(cands []string) []Hit {
				var hits []Hit
				for _, c := range cands {
					m := transcriptRe.FindAllStringIndex(c, -1)
					if len(m) >= 2 {
						hits = append(hits, Hit{Layer: p, LayerName: l.Name, Reason: "multi-turn speaker labels detected", Excerpt: excerpt(c[:min(len(c), 16)])})
						break
					}
				}
				return hits
			}})
		case LayerHighEntropy:
			p := pos
			impl.layers = append(impl.layers, activeLayer{p, l.Name, func(cands []string) []Hit {
				var hits []Hit
				for _, c := range cands {
					for _, m := range highEntropyRun.FindAllString(c, -1) {
						if uuidRe.MatchString(m) {
							continue
						}
						if shannonEntropy(m) > 4.5 {
							hits = append(hits, Hit{Layer: p, LayerName: l.Name, Reason: "high-entropy token", Excerpt: excerpt(m)})
						}
					}
				}
				return hits
			}})
		}
	}

	// Wrap impl in the public Scrubber type. We use an unexported field
	// via embedding to keep types.go's struct definition stable.
	return &Scrubber{impl: impl}, nil
}

// Scan runs the pipeline.
func (s *Scrubber) Scan(input string) Result {
	if s == nil || s.impl == nil {
		return Result{Clean: false, Hits: []Hit{{Reason: "nil scrubber (fail-closed)"}}}
	}
	cands := buildCandidates(input, s.impl.doNormalize, s.impl.doDecode)

	var hits []Hit
	for _, l := range s.impl.layers {
		// Skip pre-processing layers (already applied).
		if l.name == LayerUnicodeNormalize || l.name == LayerEncodingDecode {
			continue
		}
		hits = append(hits, l.exec(cands)...)
	}
	return Result{Clean: len(hits) == 0, Hits: hits}
}

// buildCandidates returns the set of strings each pattern layer should
// scan: the original, optionally normalized, and optionally decoded
// variants.
func buildCandidates(in string, doNormalize, doDecode bool) []string {
	out := []string{in}
	if doNormalize {
		n := norm.NFKC.String(in)
		if n != in {
			out = append(out, n)
		}
		// Confusables fold: collapse common Cyrillic / Greek lookalikes to
		// their Latin equivalents so the email/credit-card regex can match
		// IDN-spoofing attempts. This is a defense-in-depth supplement to
		// NFKC which (intentionally) does not unify distinct scripts.
		folded := foldConfusables(in)
		if folded != in {
			out = append(out, folded)
		}
	}
	if doDecode {
		// rot13 of all letters
		out = append(out, rot13(in))
		// base64-decode any 32+ char run that decodes to valid UTF-8
		for _, run := range highEntropyRun.FindAllString(in, -1) {
			if len(run) < 32 {
				continue
			}
			if dec, err := base64.StdEncoding.DecodeString(strings.TrimRight(run, "=") + padding(run)); err == nil {
				if isValidUTF8Printable(dec) {
					out = append(out, string(dec))
				}
			}
		}
		// Also try short candidates that look like base64 (handle test fixture
		// "NDExMSAxMTExIDExMTEgMTExMQ==" which is 28 chars).
		for _, run := range regexp.MustCompile(`[A-Za-z0-9+/]{16,}={0,2}`).FindAllString(in, -1) {
			if dec, err := base64.StdEncoding.DecodeString(run); err == nil {
				if isValidUTF8Printable(dec) {
					out = append(out, string(dec))
				}
			}
		}
	}
	return out
}

func padding(s string) string {
	rem := len(s) % 4
	if rem == 0 {
		return ""
	}
	return strings.Repeat("=", 4-rem)
}

func isValidUTF8Printable(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	for _, c := range b {
		if c < 0x09 || (c > 0x0d && c < 0x20) || c == 0x7f {
			return false
		}
	}
	return true
}

// confusables is a small fold table for the most common script-spoofing
// characters seen in phishing PII. Not exhaustive — extend as fixtures
// grow. Each entry maps a non-Latin codepoint to its Latin lookalike.
var confusables = map[rune]rune{
	'\u0430': 'a', // Cyrillic small a
	'\u0435': 'e', // Cyrillic small ie
	'\u043e': 'o', // Cyrillic small o
	'\u0440': 'p', // Cyrillic small er
	'\u0441': 'c', // Cyrillic small es
	'\u0445': 'x', // Cyrillic small ha
	'\u0455': 's', // Cyrillic small dze
	'\u0456': 'i', // Cyrillic small Ukrainian i
	'\u0501': 'd', // Cyrillic small komi de
	'\u051b': 'q', // Cyrillic small qa
	'\u03bf': 'o', // Greek small omicron
	'\u03b1': 'a', // Greek small alpha
}

func foldConfusables(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if rep, ok := confusables[r]; ok {
			b.WriteRune(rep)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func rot13(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune('a' + (r-'a'+13)%26)
		case r >= 'A' && r <= 'Z':
			b.WriteRune('A' + (r-'A'+13)%26)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func matchAll(cands []string, re *regexp.Regexp, pos int, name, reason string) []Hit {
	var hits []Hit
	seen := map[string]struct{}{}
	for _, c := range cands {
		for _, m := range re.FindAllString(c, -1) {
			if _, dup := seen[m]; dup {
				continue
			}
			seen[m] = struct{}{}
			hits = append(hits, Hit{Layer: pos, LayerName: name, Reason: reason, Excerpt: excerpt(m)})
		}
	}
	return hits
}

func excerpt(s string) string {
	if len(s) <= MaxExcerpt {
		return s
	}
	return s[:MaxExcerpt] + "..."
}

func stripNonDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// luhnValid implements the Luhn checksum.
func luhnValid(digits string) bool {
	sum := 0
	alt := false
	for i := len(digits) - 1; i >= 0; i-- {
		d := int(digits[i] - '0')
		if alt {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
		alt = !alt
	}
	return sum%10 == 0
}

// shannonEntropy computes bits-per-character Shannon entropy.
func shannonEntropy(s string) float64 {
	if len(s) == 0 {
		return 0
	}
	freq := map[rune]int{}
	for _, r := range s {
		freq[r]++
	}
	n := float64(len(s))
	var h float64
	for _, c := range freq {
		p := float64(c) / n
		h -= p * math.Log2(p)
	}
	return h
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
