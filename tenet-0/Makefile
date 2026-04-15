# Tenet-0 top-level targets. CI uses `make contract-test`.

.PHONY: help bus-go-test bus-ts-test contract-test all-tests

help:
	@echo "Targets:"
	@echo "  bus-go-test      Run Go client integration tests (needs PG_TEST_ADMIN_URL)"
	@echo "  bus-ts-test      Run TypeScript client integration tests"
	@echo "  contract-test    Build Go CLI + run Go↔TS interop tests"
	@echo "  all-tests        All three suites"

bus-go-test:
	cd shared/bus-go && go test ./... -v

bus-ts-test:
	cd shared/bus-ts && npm test

contract-test:
	cd contract-tests && npm test

all-tests: bus-go-test bus-ts-test contract-test
