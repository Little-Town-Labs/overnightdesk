import { z } from "zod";

const timestampString = z.string().min(1);

export const sectionStatusSchema = z.object({
  status: z.enum(["ok", "empty", "unavailable"]),
  count: z.number().int().min(0),
  message: z.string(),
  lastUpdatedAt: timestampString.nullable(),
});

export const prospectSummarySchema = z.object({
  prospectId: z.number().int(),
  displayName: z.string(),
  company: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  area: z.string().nullable(),
  status: z.string(),
  priority: z.string().nullable(),
  agiledContactId: z.string().nullable(),
  lastInteractionAt: timestampString.nullable(),
  nextActionAt: timestampString.nullable(),
  reviewFlags: z.array(z.string()),
});

export const stagedCandidateSummarySchema = z.object({
  candidateId: z.number().int(),
  businessName: z.string(),
  area: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  reviewStatus: z.enum(["recommended", "needs_review", "duplicate", "rejected", "approved"]),
  dedupeStatus: z.string(),
  dedupeReason: z.string().nullable(),
  leadSource: z.string(),
  enrichmentSource: z.string().nullable(),
  qualityScore: z.number().int().nullable(),
  sourceUrl: z.string().nullable(),
  warnings: z.array(z.string()),
});

export const callTaskSummarySchema = z.object({
  callTaskId: z.number().int(),
  prospectId: z.number().int(),
  displayName: z.string(),
  company: z.string().nullable(),
  phone: z.string().nullable(),
  dueAt: timestampString.nullable(),
  priority: z.string().nullable(),
  readiness: z.string(),
  reason: z.string().nullable(),
  status: z.string(),
});

export const reviewItemSchema = z.object({
  itemType: z.enum(["candidate", "prospect", "call_task", "follow_up_draft"]),
  itemId: z.string(),
  title: z.string(),
  reason: z.string(),
  source: z.string(),
  recommendedNextStep: z.string().nullable(),
  blockingFlags: z.array(z.string()),
});

export const followUpDraftSummarySchema = z.object({
  draftId: z.number().int(),
  prospectId: z.number().int(),
  displayName: z.string(),
  channel: z.string(),
  status: z.string(),
  createdAt: timestampString.nullable(),
  summary: z.string().nullable(),
  requiresApproval: z.boolean(),
});

export const mitchelProspectingSummarySchema = z.object({
  tenantId: z.literal("hermes-mitchel"),
  generatedAt: timestampString,
  sections: z.object({
    prospects: sectionStatusSchema,
    stagedCandidates: sectionStatusSchema,
    callTasks: sectionStatusSchema,
    reviewItems: sectionStatusSchema,
    followUpDrafts: sectionStatusSchema,
  }),
  prospects: z.array(prospectSummarySchema).max(25),
  stagedCandidates: z.array(stagedCandidateSummarySchema).max(25),
  callTasks: z.array(callTaskSummarySchema).max(25),
  reviewItems: z.array(reviewItemSchema).max(25),
  followUpDrafts: z.array(followUpDraftSummarySchema).max(25),
  warnings: z.array(z.string()).max(10),
  outboundSent: z.literal(false),
});
