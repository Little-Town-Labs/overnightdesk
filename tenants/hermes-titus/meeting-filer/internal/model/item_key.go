package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
)

var filingReferencePattern = regexp.MustCompile(`^MB-[A-Z2-7]{12}$`)
var filingDigestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

func FilingItemKey(reference, briefDigest, kind string, index int) (string, error) {
	if !filingReferencePattern.MatchString(reference) || !filingDigestPattern.MatchString(briefDigest) || index < 0 || index > 999999 || (kind != "note" && kind != "triage" && kind != "action" && kind != "commitment") {
		return "", errors.New("filing_item_key_invalid")
	}
	digest := sha256.Sum256([]byte(fmt.Sprintf("meeting-filing-item/v1\x00%s\x00%s\x00%s\x00%06d", reference, briefDigest, kind, index)))
	return hex.EncodeToString(digest[:]), nil
}
