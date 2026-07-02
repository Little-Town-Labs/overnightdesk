import { readFile } from "node:fs/promises";
import path from "node:path";
import { readSheet } from "read-excel-file/node";
import { importProspectSpreadsheetRows, prospectSpreadsheetImportToMcp } from "./spreadsheet-import.js";
import type {
  EmailEnrichmentQueueRepository,
  ProspectSpreadsheetFileImportInput,
  ProspectSpreadsheetFileImportResult,
  ProspectSpreadsheetRowInput,
  QueueRepository
} from "./types.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 100;

const HEADER_ALIASES: Record<string, keyof ProspectSpreadsheetRowInput> = {
  name: "name",
  contact: "name",
  contactname: "name",
  buyer: "name",
  buyername: "name",
  company: "company",
  business: "company",
  businessname: "company",
  store: "company",
  storename: "company",
  account: "company",
  phone: "phone",
  phonenumber: "phone",
  telephone: "phone",
  mobile: "phone",
  email: "email",
  emailaddress: "email",
  website: "website",
  site: "website",
  url: "website",
  address: "address",
  streetaddress: "address",
  citystate: "area",
  area: "area",
  location: "area",
  notes: "notes",
  note: "notes",
  comments: "notes",
  preferences: "preferences",
  preference: "preferences",
  interests: "preferences"
};

function clean(value: string | null | undefined, max: number): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"") {
      if (quoted && text[index + 1] === "\"") {
        current += "\"\"";
        index += 1;
      } else {
        quoted = !quoted;
        current += char;
      }
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      rows.push(parseCsvLine(current));
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length > 0) rows.push(parseCsvLine(current));
  return rows.filter((row) => row.some((cell) => cell.trim() !== ""));
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function rowHasIdentity(row: ProspectSpreadsheetRowInput): boolean {
  return Boolean(clean(row.company, 200) || clean(row.name, 200) || clean(row.phone, 80) || clean(row.email, 200) || clean(row.website, 500));
}

function setRowField(row: ProspectSpreadsheetRowInput, field: keyof ProspectSpreadsheetRowInput, value: string | null): void {
  switch (field) {
    case "name":
      row.name = value;
      break;
    case "company":
      row.company = value;
      break;
    case "phone":
      row.phone = value;
      break;
    case "email":
      row.email = value;
      break;
    case "website":
      row.website = value;
      break;
    case "address":
      row.address = value;
      break;
    case "area":
      row.area = value;
      break;
    case "notes":
      row.notes = value;
      break;
    case "preferences":
      row.preferences = value;
      break;
    case "rowNumber":
      break;
  }
}

function rowsFromTable(table: string[][], fileType: "CSV" | "XLSX") {
  const warnings: string[] = [];
  const rejectedRows: ProspectSpreadsheetFileImportResult["parse"]["rejectedRows"] = [];
  if (table.length < 2) {
    return { rows: [], totalDataRows: Math.max(0, table.length - 1), rejectedRows, warnings: [`${fileType} must include a header row and at least one data row.`] };
  }

  const header = table[0].map((cell) => HEADER_ALIASES[normalizeHeader(cell)] ?? null);
  if (!header.some(Boolean)) {
    return { rows: [], totalDataRows: table.length - 1, rejectedRows, warnings: [`${fileType} header row does not contain recognized prospect columns.`] };
  }

  const rows: ProspectSpreadsheetRowInput[] = [];
  for (const [offset, cells] of table.slice(1).entries()) {
    const rowNumber = offset + 2;
    if (rows.length >= MAX_ROWS) {
      warnings.push("Import was capped at 100 parsed rows; submit another batch for remaining rows.");
      break;
    }
    const row: ProspectSpreadsheetRowInput = { rowNumber };
    for (const [index, field] of header.entries()) {
      if (!field) continue;
      const max = field === "website" ? 500 : field === "address" ? 300 : field === "notes" || field === "preferences" ? 1000 : 200;
      setRowField(row, field, clean(cells[index], max));
    }
    if (!rowHasIdentity(row)) {
      rejectedRows.push({ rowNumber, reason: "missing identity or contact fields" });
      continue;
    }
    rows.push(row);
  }

  return { rows, totalDataRows: table.length - 1, rejectedRows, warnings };
}

function rowsFromCsv(text: string) {
  return rowsFromTable(parseCsv(text.replace(/^\uFEFF/, "")), "CSV");
}

async function rowsFromXlsx(filePath: string) {
  const sheet = await readSheet(filePath);
  return rowsFromTable(sheet.map((row) => row.map(cellToString)), "XLSX");
}

function rejectedFileResult(input: ProspectSpreadsheetFileImportInput, warnings: string[]): ProspectSpreadsheetFileImportResult {
  const batch = clean(input.sourceBatch, 120) ?? "spreadsheet_import";
  const label = clean(input.sourceLabel, 120) ?? "Spreadsheet import";
  return {
    status: "rejected",
    file: {
      path: input.filePath,
      originalFilename: path.basename(input.filePath)
    },
    parse: {
      totalDataRows: 0,
      importedRows: 0,
      rejectedRows: [],
      warnings
    },
    import: {
      status: "rejected",
      sourceLabel: label,
      sourceBatch: batch,
      counts: {
        totalRows: 0,
        created: 0,
        updated: 0,
        needsReview: 0,
        rejected: 0
      },
      rows: [],
      emailEnrichment: null,
      warnings,
      outboundSent: false
    },
    warnings,
    outboundSent: false
  };
}

export async function importProspectSpreadsheetFile(
  repo: QueueRepository & EmailEnrichmentQueueRepository,
  input: ProspectSpreadsheetFileImportInput
): Promise<ProspectSpreadsheetFileImportResult> {
  const extension = path.extname(input.filePath).toLowerCase();
  if (extension !== ".csv" && extension !== ".xlsx") {
    return rejectedFileResult(input, ["Only CSV and XLSX files are supported. Legacy .xls files are not parsed by this workflow."]);
  }

  const buffer = await readFile(input.filePath);
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return rejectedFileResult(input, ["Spreadsheet file is too large. Maximum size is 5MB."]);
  }

  let parsed: ReturnType<typeof rowsFromCsv>;
  try {
    parsed = extension === ".xlsx"
      ? await rowsFromXlsx(input.filePath)
      : rowsFromCsv(buffer.toString("utf8"));
  } catch {
    return rejectedFileResult(input, [`Unable to parse ${extension.slice(1).toUpperCase()} spreadsheet file.`]);
  }
  if (parsed.rows.length === 0) {
    return rejectedFileResult(input, parsed.warnings.length ? parsed.warnings : ["Spreadsheet did not contain importable prospect rows."]);
  }

  const imported = await importProspectSpreadsheetRows(repo, {
    requestedBy: input.requestedBy,
    sourceLabel: input.sourceLabel,
    sourceBatch: input.sourceBatch,
    seedEmailEnrichment: input.seedEmailEnrichment,
    createCallTasks: input.createCallTasks,
    rows: parsed.rows
  });

  const warnings = [...parsed.warnings, ...imported.warnings];
  return {
    status: imported.status,
    file: {
      path: input.filePath,
      originalFilename: path.basename(input.filePath)
    },
    parse: {
      totalDataRows: parsed.totalDataRows,
      importedRows: parsed.rows.length,
      rejectedRows: parsed.rejectedRows,
      warnings: parsed.warnings
    },
    import: imported,
    warnings,
    outboundSent: false
  };
}

export function prospectSpreadsheetFileImportToMcp(result: ProspectSpreadsheetFileImportResult) {
  return {
    status: result.status,
    file: result.file,
    parse: {
      total_data_rows: result.parse.totalDataRows,
      imported_rows: result.parse.importedRows,
      rejected_rows: result.parse.rejectedRows.map((row) => ({
        row_number: row.rowNumber,
        reason: row.reason
      })),
      warnings: result.parse.warnings
    },
    import: prospectSpreadsheetImportToMcp(result.import),
    warnings: result.warnings,
    outbound_sent: false
  };
}
