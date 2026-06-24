# Research: Prospect Sourcing Pipeline

## Decision: BrowserAct is the first-pass discovery path

**Rationale**: Aegis production has a BrowserAct skill with an established
diamond-buyer discovery workflow: run the Google Maps Scraper template for bulk
business discovery, filter independent stores, run Google Business Contact
Finder for contact fields, and optionally run Website Data Scrape. Production
memory records that a Tysons Corner scrape used this family of workflows and
saved independent stores to `trevor.prospects`.

**Alternatives considered**:

- CamoFox-only discovery: rejected because the user clarified the intended
  order and the live BrowserAct skill already contains the bulk discovery and
  template contact-finder workflow.
- Raw HTTP requests: rejected for discovery sources with anti-bot behavior,
  map/listing complexity, and dynamic pages.

## Decision: CamoFox enriches and verifies BrowserAct candidates

**Rationale**: Aegis production has a running `camofox-browser` container and a
tenant skill that describes CamoFox as the native Hermes tool for stealth
browsing, anti-bot pages, Google/DuckDuckGo blocks, and contact enrichment.
After BrowserAct finds candidate businesses, CamoFox should add missing website
detail, verify contact paths, and inspect pages that BrowserAct cannot enrich.

**Alternatives considered**:

- BrowserAct-only enrichment: rejected because BrowserAct contact finder is
  slow and inconsistent, and CamoFox is available for direct website inspection.
- Source-control any live credential: rejected because credentials must remain
  outside git.

## Decision: Stage candidates before active prospect writes

**Rationale**: Scraped results are noisy and may include chains, duplicates,
  non-buyers, weak contact data, and stale pages. A review state prevents
  garbage from entering `trevor.prospects` and the daily call queue.

**Alternatives considered**:

- Insert directly into `trevor.prospects`: rejected because the live DB already
  has 43 prospects with no lead-source attribution and no Agiled links; direct
  inserts would deepen drift.
- Store only in markdown: rejected because the project standard treats
  `trevor.prospects` as the authoritative prospect store.

## Decision: Use source attribution as a required invariant

**Rationale**: Mitchel and operators need to know whether a lead came from
  BrowserAct Google Maps, CamoFox Google search, manual intake, Agiled, or a
  future website. This supports quality review and conversion analysis.

**Alternatives considered**:

- Free-text-only notes: rejected because source attribution becomes hard to
  query and easy to lose.

## Decision: Validate scraped and third-party output as untrusted input

**Rationale**: Public pages and scraper results can include hostile text,
  malformed fields, or prompt-injection-like instructions. The MCP layer should
  validate candidate shape, bound stored notes, and avoid logging full scraped
  pages.

**Alternatives considered**:

- Trust scraper output because it comes from a tool: rejected because external
  web content remains untrusted regardless of transport.
