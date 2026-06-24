#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generatePreCallBrief, preCallBriefToMcp } from "./brief.js";
import { capturePostCall, postCallCaptureToMcp } from "./capture.js";
import { enrichProspectUrlWithCamoFox, trevorCamoFoxEnrichmentToMcp } from "./camofox.js";
import { createPool, PgQueueRepository } from "./db.js";
import { cadenceDigestToMcp, generateCadenceDigest } from "./digest.js";
import {
  followUpDraftToMcp,
  followUpSendQueueToMcp,
  generateFollowUpDraft,
  listFollowUpsAwaitingSend,
  logManualFollowUpSent,
  manualFollowUpSentToMcp,
  markFollowUpDraft
} from "./followup.js";
import {
  callTasksToMcp,
  generateDailyCallQueue,
  listCallTasks,
  markCallTaskStatus,
  queueRunToMcp,
  taskStatusToMcp
} from "./queue.js";
import { sanitizeError } from "./safety.js";
import {
  promoteProspectCandidate,
  promoteProspectCandidateToMcp,
  reviewProspectCandidates,
  reviewProspectCandidatesToMcp,
  stageProspectCandidates,
  stageProspectCandidatesToMcp
} from "./sourcing.js";
import type { CallTaskStatus } from "./types.js";

const pool = createPool();
const repo = new PgQueueRepository(pool);

try {
  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();
  console.error("[trevor-db] Connected to tenet0-postgres (trevor schema)");
} catch (err) {
  console.error("[trevor-db] FATAL: cannot connect to database:", sanitizeError(err));
  process.exit(1);
}

const server = new McpServer({
  name: "trevor-db",
  version: "1.8.0"
});

server.registerTool("db_query", {
  description: "Run a read-only SQL SELECT against the trevor schema.",
  inputSchema: {
    sql: z.string().describe("SELECT statement. Always qualify table names with trevor.")
  }
}, async ({ sql }) => {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return { content: [{ type: "text", text: "Error: db_query only runs SELECT statements. Use db_execute for writes." }] };
  }
  try {
    const result = await pool.query(sql);
    return { content: [{ type: "text", text: JSON.stringify({ rows: result.rows, rowCount: result.rowCount }) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Query error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("db_execute", {
  description: "Run an INSERT, UPDATE, or DELETE against the trevor schema. Prefer purpose-built Trevor tools for repeated workflows.",
  inputSchema: {
    sql: z.string().describe("INSERT / UPDATE / DELETE statement targeting trevor.* tables"),
    params: z.array(z.unknown()).optional().describe("Parameterized query values ($1, $2, ...)")
  }
}, async ({ sql, params }) => {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith("SELECT") || trimmed.startsWith("DROP") || trimmed.startsWith("TRUNCATE") || trimmed.startsWith("ALTER")) {
    return { content: [{ type: "text", text: "Error: db_execute is for INSERT/UPDATE/DELETE only. Use db_query for SELECT." }] };
  }
  try {
    const result = await pool.query(sql, params);
    return { content: [{ type: "text", text: JSON.stringify({ rowCount: result.rowCount, rows: result.rows ?? [] }) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Execute error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("generate_daily_call_queue", {
  description: "Generate Mitchel's on-demand daily call queue from Trevor prospect data. Suppresses do-not-contact records and can persist stable call tasks.",
  inputSchema: {
    sales_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(25).optional(),
    persist: z.boolean().optional(),
    include_review_needed: z.boolean().optional(),
    inventory_context: z.string().max(4000).optional()
  }
}, async (input) => {
  try {
    const result = await generateDailyCallQueue(repo, {
      salesDay: input.sales_day,
      limit: input.limit,
      persist: input.persist,
      includeReviewNeeded: input.include_review_needed,
      inventoryContext: input.inventory_context
    });
    return { content: [{ type: "text", text: JSON.stringify(queueRunToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Queue error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("list_call_tasks", {
  description: "List Trevor call tasks for Mitchel's prospecting workflow.",
  inputSchema: {
    status: z.enum(["open", "completed", "snoozed", "discarded"]).optional(),
    sales_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(50).optional()
  }
}, async (input) => {
  try {
    const result = await listCallTasks(repo, input.status as CallTaskStatus | undefined, input.sales_day, input.limit);
    return { content: [{ type: "text", text: JSON.stringify(callTasksToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `List tasks error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("mark_call_task_status", {
  description: "Mark a Trevor call task open, completed, snoozed, or discarded. Does not create interactions or send follow-up.",
  inputSchema: {
    task_id: z.number().int().positive(),
    status: z.enum(["open", "completed", "snoozed", "discarded"]),
    reason: z.string().max(500).optional()
  }
}, async (input) => {
  try {
    const result = await markCallTaskStatus(repo, input.task_id, input.status);
    return { content: [{ type: "text", text: JSON.stringify(taskStatusToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Mark task error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("generate_pre_call_brief", {
  description: "Generate a read-only Trevor pre-call brief by task, prospect, or bounded name/company query.",
  inputSchema: {
    task_id: z.number().int().positive().optional(),
    prospect_id: z.number().int().positive().optional(),
    query: z.string().trim().min(2).max(120).optional(),
    inventory_context: z.string().max(4000).optional()
  }
}, async (input) => {
  const lookupCount = [input.task_id, input.prospect_id, input.query].filter((value) => value !== undefined && value !== "").length;
  if (lookupCount !== 1) {
    return { content: [{ type: "text", text: "Brief error: provide exactly one of task_id, prospect_id, or query." }] };
  }

  try {
    const result = await generatePreCallBrief(repo, {
      taskId: input.task_id,
      prospectId: input.prospect_id,
      query: input.query,
      inventoryContext: input.inventory_context
    });
    return { content: [{ type: "text", text: JSON.stringify(preCallBriefToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Brief error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("capture_post_call", {
  description: "Capture a Mitchel prospecting call outcome. Writes a local interaction and prospect state only; never sends outbound follow-up.",
  inputSchema: {
    task_id: z.number().int().positive().optional(),
    prospect_id: z.number().int().positive().optional(),
    outcome: z.enum([
      "no_answer",
      "left_voicemail",
      "interested",
      "quoted",
      "follow_up_later",
      "not_interested",
      "sold",
      "wrong_number",
      "do_not_contact"
    ]).optional(),
    summary: z.string().trim().max(2000).optional(),
    next_action_type: z.string().trim().max(80).optional(),
    next_action_at: z.string().trim().max(80).optional(),
    agiled_note: z.boolean().optional()
  }
}, async (input) => {
  try {
    const result = await capturePostCall(repo, {
      taskId: input.task_id,
      prospectId: input.prospect_id,
      outcome: input.outcome,
      summary: input.summary,
      nextActionType: input.next_action_type,
      nextActionAt: input.next_action_at,
      agiledNote: input.agiled_note
    });
    return { content: [{ type: "text", text: JSON.stringify(postCallCaptureToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Capture error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("generate_follow_up_draft", {
  description: "Generate and store a human-reviewable Mitchel follow-up draft from a captured Trevor interaction. Draft-only; never sends outbound messages.",
  inputSchema: {
    interaction_id: z.number().int().positive(),
    channel: z.enum(["email", "telegram", "sms", "linkedin", "instagram"]),
    tone: z.string().trim().max(120).optional(),
    regenerate: z.boolean().optional()
  }
}, async (input) => {
  try {
    const result = await generateFollowUpDraft(repo, {
      interactionId: input.interaction_id,
      channel: input.channel,
      tone: input.tone,
      regenerate: input.regenerate
    });
    return { content: [{ type: "text", text: JSON.stringify(followUpDraftToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Follow-up draft error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("mark_follow_up_draft", {
  description: "Mark a Trevor follow-up draft approved or discarded. Approval does not send the draft.",
  inputSchema: {
    draft_id: z.number().int().positive(),
    action: z.enum(["approve", "discard"]),
    approved_by: z.string().trim().max(120).optional()
  }
}, async (input) => {
  try {
    const result = await markFollowUpDraft(repo, {
      draftId: input.draft_id,
      action: input.action,
      approvedBy: input.approved_by
    });
    return { content: [{ type: "text", text: JSON.stringify(followUpDraftToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Follow-up draft mark error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("list_follow_ups_awaiting_send", {
  description: "List approved Trevor follow-up drafts awaiting human send confirmation. Omits draft bodies and never sends outbound messages.",
  inputSchema: {
    limit: z.number().int().min(1).max(25).optional(),
    include_do_not_contact: z.boolean().optional()
  }
}, async (input) => {
  try {
    const result = await listFollowUpsAwaitingSend(repo, {
      limit: input.limit,
      includeDoNotContact: input.include_do_not_contact
    });
    return { content: [{ type: "text", text: JSON.stringify(followUpSendQueueToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Follow-up send queue error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("log_manual_follow_up_sent", {
  description: "Confirm an approved Trevor follow-up draft was manually sent by a human. Writes one local interaction record; never sends outbound messages.",
  inputSchema: {
    draft_id: z.number().int().positive(),
    sent_at: z.string().trim().max(80),
    confirmed_by: z.string().trim().min(1).max(120),
    sent_via: z.string().trim().min(1).max(80).optional(),
    external_message_id: z.string().trim().max(240).optional(),
    audit_only_reason: z.string().trim().max(1000).optional()
  }
}, async (input) => {
  try {
    const result = await logManualFollowUpSent(repo, {
      draftId: input.draft_id,
      sentAt: input.sent_at,
      confirmedBy: input.confirmed_by,
      sentVia: input.sent_via,
      externalMessageId: input.external_message_id,
      auditOnlyReason: input.audit_only_reason
    });
    return { content: [{ type: "text", text: JSON.stringify(manualFollowUpSentToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Follow-up sent log error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("generate_cadence_digest", {
  description: "Generate Mitchel's daily cadence digest from Trevor call queue, stale work, and follow-up approvals. Defaults to read-only and never sends outbound messages.",
  inputSchema: {
    sales_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(25).optional(),
    persist_call_tasks: z.boolean().optional(),
    include_review_needed: z.boolean().optional(),
    include_dormant: z.boolean().optional(),
    scheduled: z.boolean().optional(),
    inventory_context: z.string().max(4000).optional()
  }
}, async (input) => {
  try {
    const result = await generateCadenceDigest(repo, {
      salesDay: input.sales_day,
      limit: input.limit,
      persistCallTasks: input.persist_call_tasks,
      includeReviewNeeded: input.include_review_needed,
      includeDormant: input.include_dormant,
      scheduled: input.scheduled,
      inventoryContext: input.inventory_context
    });
    return { content: [{ type: "text", text: JSON.stringify(cadenceDigestToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Cadence digest error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("stage_prospect_candidates", {
  description: "Stage BrowserAct-discovered prospect candidates, optionally enriched by CamoFox, for review before creating Trevor prospects. Never sends outbound messages.",
  inputSchema: {
    source: z.enum([
      "browseract_google_maps",
      "browseract_contact_finder",
      "browseract_industry_radar",
      "manual_import"
    ]),
    enrichment_source: z.enum([
      "camofox_website_recon",
      "camofox_contact_enrichment",
      "browseract_website_data_scrape"
    ]).optional(),
    area: z.string().trim().min(1).max(120),
    keyword: z.string().trim().max(160).optional(),
    requested_by: z.string().trim().max(120).optional(),
    candidates: z.array(z.object({
      business_name: z.string().trim().min(1).max(200),
      company: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(80).optional(),
      email: z.string().trim().max(200).optional(),
      website: z.string().trim().max(500).optional(),
      source_url: z.string().trim().max(500).optional(),
      enrichment_url: z.string().trim().max(500).optional(),
      rating: z.number().min(0).max(5).optional(),
      review_count: z.number().int().min(0).optional(),
      notes: z.string().trim().max(1000).optional()
    })).min(1).max(50)
  }
}, async (input) => {
  try {
    const result = await stageProspectCandidates(repo, {
      source: input.source,
      enrichmentSource: input.enrichment_source,
      area: input.area,
      keyword: input.keyword,
      requestedBy: input.requested_by,
      candidates: input.candidates.map((candidate) => ({
        businessName: candidate.business_name,
        company: candidate.company,
        phone: candidate.phone,
        email: candidate.email,
        website: candidate.website,
        sourceUrl: candidate.source_url,
        enrichmentUrl: candidate.enrichment_url,
        rating: candidate.rating,
        reviewCount: candidate.review_count,
        notes: candidate.notes
      }))
    });
    return { content: [{ type: "text", text: JSON.stringify(stageProspectCandidatesToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Prospect sourcing stage error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("trevor_camofox_enrich_url", {
  description: "Use the production CamoFox service to inspect one public prospect website/contact page for Trevor prospect enrichment. Read-only; never sends outbound messages.",
  inputSchema: {
    url: z.string().trim().url().max(500),
    include_links: z.boolean().optional()
  }
}, async (input) => {
  try {
    const result = await enrichProspectUrlWithCamoFox({
      url: input.url,
      includeLinks: input.include_links
    });
    return { content: [{ type: "text", text: JSON.stringify(trevorCamoFoxEnrichmentToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Trevor CamoFox enrichment error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("review_prospect_candidates", {
  description: "List staged prospect candidates for review, grouped by recommended, needs-review, duplicate, rejected, and approved states.",
  inputSchema: {
    sourcing_run_id: z.number().int().positive().optional(),
    status: z.enum(["recommended", "needs_review", "duplicate", "rejected", "approved"]).optional(),
    limit: z.number().int().min(1).max(50).optional()
  }
}, async (input) => {
  try {
    const result = await reviewProspectCandidates(repo, {
      sourcingRunId: input.sourcing_run_id,
      status: input.status,
      limit: input.limit
    });
    return { content: [{ type: "text", text: JSON.stringify(reviewProspectCandidatesToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Prospect sourcing review error: ${sanitizeError(err)}` }] };
  }
});

server.registerTool("promote_prospect_candidate", {
  description: "Promote an explicitly approved staged candidate into Trevor prospects and optionally queue initial outreach. Never sends outbound messages.",
  inputSchema: {
    candidate_id: z.number().int().positive(),
    approved_by: z.string().trim().min(1).max(120),
    create_call_task: z.boolean().optional(),
    approval_note: z.string().trim().max(500).optional()
  }
}, async (input) => {
  try {
    const result = await promoteProspectCandidate(repo, {
      candidateId: input.candidate_id,
      approvedBy: input.approved_by,
      createCallTask: input.create_call_task,
      approvalNote: input.approval_note
    });
    return { content: [{ type: "text", text: JSON.stringify(promoteProspectCandidateToMcp(result)) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Prospect sourcing promote error: ${sanitizeError(err)}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[trevor-db] MCP server ready");
