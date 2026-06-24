#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generatePreCallBrief, preCallBriefToMcp } from "./brief.js";
import { capturePostCall, postCallCaptureToMcp } from "./capture.js";
import { createPool, PgQueueRepository } from "./db.js";
import {
  callTasksToMcp,
  generateDailyCallQueue,
  listCallTasks,
  markCallTaskStatus,
  queueRunToMcp,
  taskStatusToMcp
} from "./queue.js";
import { sanitizeError } from "./safety.js";
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
  version: "1.3.0"
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[trevor-db] MCP server ready");
