import { captureBuyerIntake } from "./intake.js";
import type {
  EmailEnrichmentQueueRepository,
  ProspectSpreadsheetImportInput,
  ProspectSpreadsheetImportResult,
  ProspectSpreadsheetRowInput,
  QueueRepository
} from "./types.js";

const DEFAULT_SOURCE_BATCH = "spreadsheet_import";

function clean(value: string | null | undefined, max: number): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function sourceBatch(value: string | null | undefined): string {
  return clean(value, 120) ?? DEFAULT_SOURCE_BATCH;
}

function sourceLabel(value: string): string {
  return clean(value, 120) ?? "Spreadsheet import";
}

function rowContext(row: ProspectSpreadsheetRowInput, label: string, batch: string): string {
  return [
    `Spreadsheet import: ${label}.`,
    `Source batch: ${batch}.`,
    row.rowNumber ? `Source row: ${row.rowNumber}.` : null,
    clean(row.notes, 500),
    clean(row.preferences, 500) ? `Preferences: ${clean(row.preferences, 500)}.` : null
  ].filter(Boolean).join(" ");
}

export async function importProspectSpreadsheetRows(
  repo: QueueRepository & EmailEnrichmentQueueRepository,
  input: ProspectSpreadsheetImportInput
): Promise<ProspectSpreadsheetImportResult> {
  const label = sourceLabel(input.sourceLabel);
  const batch = sourceBatch(input.sourceBatch);
  const warnings: string[] = [];
  const rows = input.rows.slice(0, 100);
  if (input.rows.length > rows.length) {
    warnings.push("Import was capped at 100 rows; submit another batch for remaining rows.");
  }

  const results: ProspectSpreadsheetImportResult["rows"] = [];
  for (const [index, row] of rows.entries()) {
    const intake = await captureBuyerIntake(repo, {
      requestedBy: clean(input.requestedBy, 120) ?? undefined,
      source: "spreadsheet_import",
      name: clean(row.name, 200) ?? undefined,
      company: clean(row.company, 200) ?? undefined,
      phone: clean(row.phone, 80) ?? undefined,
      email: clean(row.email, 200) ?? undefined,
      website: clean(row.website, 500) ?? undefined,
      address: clean(row.address, 300) ?? undefined,
      area: clean(row.area, 120) ?? undefined,
      preferences: rowContext(row, label, batch),
      conversationChannel: "other",
      conversationSummary: `Imported from ${label}${row.rowNumber ? ` row ${row.rowNumber}` : ""}.`,
      outcome: "new_lead",
      nextActionType: input.createCallTasks ? "call" : "review",
      createCallTask: input.createCallTasks ?? false,
      agiledSync: "not_attempted"
    });

    results.push({
      rowNumber: row.rowNumber ?? index + 1,
      status: intake.status,
      prospectId: intake.prospectId,
      interactionId: intake.interactionId,
      dedupeStatus: intake.dedupeStatus,
      warnings: intake.warnings
    });
  }

  const created = results.filter((row) => row.status === "created").length;
  const updated = results.filter((row) => row.status === "updated").length;
  const needsReview = results.filter((row) => row.status === "needs_review").length;
  const rejected = results.filter((row) => row.status === "rejected").length;
  const importedProspectIds = [...new Set(results
    .map((row) => row.prospectId)
    .filter((prospectId): prospectId is number => typeof prospectId === "number" && Number.isInteger(prospectId) && prospectId > 0))];
  const emailEnrichment = input.seedEmailEnrichment === false
    ? null
    : await repo.seedEmailEnrichmentQueue({ sourceBatch: batch, sourceLabel: label, prospectIds: importedProspectIds });
  try {
    await repo.recordProspectImportRun({
      sourceBatch: batch,
      sourceLabel: label,
      filePath: clean(input.filePath, 1000),
      originalFilename: clean(input.originalFilename, 300),
      requestedBy: clean(input.requestedBy, 120),
      totalRows: results.length,
      createdCount: created,
      updatedCount: updated,
      needsReviewCount: needsReview,
      rejectedCount: rejected,
      enrichmentInsertedCount: emailEnrichment?.insertedCount ?? 0,
      enrichmentAlreadyQueuedCount: emailEnrichment?.alreadyQueuedCount ?? 0,
      enrichmentExistingEmailCount: emailEnrichment?.syncedExistingEmailCount ?? 0,
      enrichmentResetClaimedCount: emailEnrichment?.resetClaimedCount ?? 0,
      warnings
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    warnings.push(`Import run ledger write failed: ${message}`);
  }

  return {
    status: rejected === results.length ? "rejected" : needsReview > 0 ? "needs_review" : "imported",
    sourceLabel: label,
    sourceBatch: batch,
    counts: {
      totalRows: results.length,
      created,
      updated,
      needsReview,
      rejected
    },
    rows: results,
    emailEnrichment,
    warnings,
    outboundSent: false
  };
}

export function prospectSpreadsheetImportToMcp(result: ProspectSpreadsheetImportResult) {
  return {
    status: result.status,
    source_label: result.sourceLabel,
    source_batch: result.sourceBatch,
    counts: {
      total_rows: result.counts.totalRows,
      created: result.counts.created,
      updated: result.counts.updated,
      needs_review: result.counts.needsReview,
      rejected: result.counts.rejected
    },
    rows: result.rows.map((row) => ({
      row_number: row.rowNumber,
      status: row.status,
      prospect_id: row.prospectId,
      interaction_id: row.interactionId,
      dedupe_status: row.dedupeStatus,
      warnings: row.warnings
    })),
    email_enrichment: result.emailEnrichment ? {
      status: result.emailEnrichment.status,
      inserted_count: result.emailEnrichment.insertedCount,
      already_queued_count: result.emailEnrichment.alreadyQueuedCount,
      synced_existing_email_count: result.emailEnrichment.syncedExistingEmailCount,
      reset_claimed_count: result.emailEnrichment.resetClaimedCount,
      warnings: result.emailEnrichment.warnings,
      outbound_sent: false
    } : null,
    warnings: result.warnings,
    outbound_sent: false
  };
}
