---
name: browseract
description: BrowserAct first-pass workflow for public prospect discovery and template contact finding.
version: 1.0.0
author: OvernightDesk
metadata:
  hermes:
    tags: [scraping, automation, browseract, prospecting, diamond]
---

# BrowserAct Prospect Sourcing

BrowserAct is the first-pass path for Mitchel prospect sourcing. Use it for
bulk public business discovery and known template-driven contact finding. Use
CamoFox afterward to enrich or verify candidate websites when BrowserAct output
is incomplete.

## Secret Handling

The BrowserAct API key must come from runtime configuration such as
`BROWSERACT_API_KEY`. Never hard-code the key in this file, specs, tests,
runbooks, logs, or source code.

## Verified Workflow Templates

Use these template identifiers only as non-secret configuration values:

| Template ID | Name | Parameters |
|-------------|------|------------|
| `54054669770646127` | Google Maps Scraper | `Keyword`, `Area`, `datalimit` |
| `89720224238575367` | Google Business Contact Finder | `Company_name` |
| `64208669348207286` | Social Links Scraper | `url` |
| `54602233871863413` | Website Data Scrape | `websitelink` |
| `72676867414427158` | Social Media Finder | `business_name`, `website` |
| `88313898888855812` | Industry Key Contact Radar | `industry`, `role`, `location` |

Parameter names are case-sensitive.

## Diamond Buyer Discovery Pattern

1. Run a bounded Google Maps scrape for a specific area and keyword such as
   `jewelry stores diamond dealers`.
2. Filter for independent stores:
   - Prefer rating 4.5 or higher when available.
   - Prefer 50 or more reviews when available.
   - Exclude chain stores and non-buyer businesses.
3. Enrich promising stores one at a time with the Contact Finder template when
   useful.
4. Hand incomplete or high-value candidates to CamoFox for website/contact
   enrichment or verification.
5. Stage results through Trevor candidate review.

## Chain Stores To Exclude

- KAY Jewelers and KAY Outlet
- Jared and Jared Vault
- Helzberg Diamonds
- REEDS Jewelers
- Blue Nile
- Zales and Zales Outlet
- Diamonds Direct
- Shane Co
- Tiffany & Co
- Cartier

## Output Handling

- Google Maps results may arrive as CSV files.
- Contact Finder and Website Data Scrape may return JSON strings.
- Validate all output shape before using it.
- Do not store raw output files or full scraped pages in Trevor.
- Do not directly insert prospects from BrowserAct output. Stage first.
