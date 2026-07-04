import type {
  CallTaskStatus,
  BuyerIntakeInteractionWrite,
  BuyerIntakeLookup,
  BuyerIntakeProspectUpdate,
  BuyerIntakeProspectWrite,
  BuyerIntakeRecordWrite,
  BuyerIntakeRecordWriteResult,
  EmailEnrichmentApplyWrite,
  EmailEnrichmentClaimWrite,
  EmailEnrichmentConfidence,
  EmailEnrichmentRecord,
  EmailEnrichmentSeedWrite,
  EmailEnrichmentStatus,
  ExistingCallTask,
  FollowUpChannel,
  FollowUpContext,
  FollowUpDraftRecord,
  FollowUpDraftWrite,
  ManualFollowUpSentWrite,
  PreCallBriefLookup,
  PostCallCaptureWrite,
  PostCallCaptureWriteResult,
  PromoteProspectCandidateWrite,
  ProspectImportBatchLookupResult,
  ProspectImportRunWrite,
  ProspectCandidate,
  ProspectInteraction,
  ProspectResearchClaimResult,
  ProspectResearchEvidenceListInput,
  ProspectResearchEvidenceListResult,
  ProspectResearchEvidenceRecord,
  ProspectResearchEvidenceWrite,
  ProspectSourceCandidateRecord,
  ProspectSourcingRunRecord,
  QueueRepository,
  ReviewProspectCandidatesInput,
  ReviewProspectCandidatesResult,
  StageProspectCandidatesWrite
} from "../src/types.js";

export class FakeQueueRepository implements QueueRepository {
  public tasks: ExistingCallTask[] = [];
  public interactions: ProspectInteraction[] = [];
  public drafts: FollowUpDraftRecord[] = [];
  public sourcingRuns: ProspectSourcingRunRecord[] = [];
  public sourcingCandidates: ProspectSourceCandidateRecord[] = [];
  public emailEnrichment: EmailEnrichmentRecord[] = [];
  public researchEvidence: ProspectResearchEvidenceRecord[] = [];
  public prospectImportRuns: Array<ProspectImportRunWrite & { id: number; createdAt: Date }> = [];
  public created = 0;
  public captured = 0;

  constructor(public candidates: ProspectCandidate[]) {}

  private candidateWebsite(candidate: ProspectCandidate): string | null {
    const match = /Website:\s*(https?:\/\/[^\s]+)/i.exec(candidate.notes ?? "");
    return match?.[1]?.replace(/[.,;)]+$/, "") ?? null;
  }

  async listProspectCandidates(_salesDay: string, limit: number, options: { callableOnly?: boolean } = {}): Promise<ProspectCandidate[]> {
    const candidates = options.callableOnly
      ? this.candidates.filter((candidate) => !candidate.doNotContact && candidate.phone)
      : this.candidates;
    return candidates.slice(0, limit);
  }

  async findOpenCallTask(prospectId: number, salesDay: string): Promise<ExistingCallTask | null> {
    return this.tasks.find((task) =>
      task.prospectId === prospectId &&
      task.status === "open" &&
      task.dueAt?.toISOString().slice(0, 10) === salesDay
    ) ?? null;
  }

  async createCallTask(input: {
    prospectId: number;
    priority: number;
    reason: string;
    callObjective: string;
    dueAt: string;
  }): Promise<ExistingCallTask> {
    this.created += 1;
    const created: ExistingCallTask = {
      id: 1000 + this.created,
      prospectId: input.prospectId,
      status: "open",
      dueAt: new Date(input.dueAt)
    };
    this.tasks.push(created);
    return created;
  }

  async listCallTasks(status: CallTaskStatus, salesDay: string | undefined, limit: number) {
    return this.tasks
      .filter((task) => task.status === status)
      .filter((task) => !salesDay || task.dueAt?.toISOString().slice(0, 10) === salesDay)
      .slice(0, limit)
      .map((task) => ({
        taskId: task.id,
        prospectId: task.prospectId,
        displayName: `Prospect ${task.prospectId}`,
        status: task.status,
        priority: 1,
        reason: "Test reason",
        callObjective: "Test objective",
        dueAt: task.dueAt,
        completedAt: null
      }));
  }

  async markCallTaskStatus(taskId: number, status: CallTaskStatus) {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) {
      return { taskId, status, updated: false, completedAt: null };
    }
    const prospect = this.candidates.find((candidate) => candidate.id === task.prospectId);
    if (status === "open" && prospect?.doNotContact) {
      throw new Error("Cannot reopen call task for a do-not-contact prospect");
    }
    task.status = status;
    const completedAt = status === "completed" ? new Date("2026-06-24T16:00:00Z") : null;
    return { taskId, status, updated: true, completedAt };
  }

  async findCallTaskById(taskId: number) {
    return this.tasks.find((task) => task.id === taskId) ?? null;
  }

  async findProspectById(prospectId: number): Promise<ProspectCandidate | null> {
    return this.candidates.find((candidate) => candidate.id === prospectId) ?? null;
  }

  async searchProspects(query: string, limit: number): Promise<ProspectCandidate[]> {
    const normalized = query.trim().toLowerCase();
    return this.candidates
      .filter((candidate) =>
        candidate.name?.toLowerCase().includes(normalized) ||
        candidate.company?.toLowerCase().includes(normalized)
      )
      .slice(0, limit);
  }

  async findBuyerIntakeMatches(input: BuyerIntakeLookup): Promise<ProspectCandidate[]> {
    const phoneDigits = (input.phone ?? "").replace(/[^0-9]/g, "");
    const email = input.email?.trim().toLowerCase();
    const company = input.company?.trim().toLowerCase();
    const name = input.name?.trim().toLowerCase();
    return this.candidates
      .filter((candidate) => candidate.status !== "archived")
      .filter((candidate) => {
        const candidatePhone = (candidate.phone ?? "").replace(/[^0-9]/g, "");
        const candidateEmail = candidate.email?.trim().toLowerCase();
        const candidateCompany = candidate.company?.trim().toLowerCase();
        const candidateName = candidate.name?.trim().toLowerCase();
        return (
          Boolean(phoneDigits && candidatePhone && candidatePhone === phoneDigits) ||
          Boolean(email && candidateEmail && candidateEmail === email) ||
          Boolean(company && candidateCompany && (candidateCompany.includes(company) || company.includes(candidateCompany))) ||
          Boolean(name && candidateName && (candidateName.includes(name) || name.includes(candidateName)))
        );
      })
      .slice(0, input.limit);
  }

  async createBuyerIntakeProspect(input: BuyerIntakeProspectWrite): Promise<ProspectCandidate> {
    const nextId = this.candidates.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const created: ProspectCandidate = {
      id: nextId,
      name: input.name,
      company: input.company,
      email: input.email,
      phone: input.phone,
      status: input.status ?? "active",
      notes: input.notes,
      agiledContactId: input.agiledContactId,
      preferredChannel: input.preferredChannel,
      doNotContact: input.doNotContact,
      lastOutcome: input.lastOutcome,
      nextActionType: input.nextActionType,
      nextActionAt: input.nextActionAt,
      priority: input.priority,
      updatedAt: new Date("2026-06-24T21:00:00Z"),
      lastInteractionAt: null
    };
    this.candidates.push(created);
    return created;
  }

  async updateBuyerIntakeProspect(prospectId: number, input: BuyerIntakeProspectUpdate): Promise<ProspectCandidate | null> {
    const prospect = this.candidates.find((candidate) => candidate.id === prospectId);
    if (!prospect) return null;
    if (input.name) prospect.name = input.name;
    if (input.company) prospect.company = input.company;
    if (input.email) prospect.email = input.email;
    if (input.phone) prospect.phone = input.phone;
    if (input.status) prospect.status = input.status;
    if (input.notes) prospect.notes = [prospect.notes, input.notes].filter(Boolean).join("\n");
    if (input.agiledContactId) prospect.agiledContactId = input.agiledContactId;
    if (input.preferredChannel) prospect.preferredChannel = input.preferredChannel;
    if (input.doNotContact !== undefined) prospect.doNotContact = input.doNotContact;
    if (input.lastOutcome) prospect.lastOutcome = input.lastOutcome;
    if (input.nextActionType !== undefined) prospect.nextActionType = input.nextActionType;
    if (input.nextActionAt !== undefined && input.nextActionAt !== null) prospect.nextActionAt = input.nextActionAt;
    prospect.updatedAt = new Date("2026-06-24T21:15:00Z");
    return prospect;
  }

  async createBuyerIntakeInteraction(input: BuyerIntakeInteractionWrite): Promise<ProspectInteraction & { id: number }> {
    this.captured += 1;
    const interaction = {
      id: this.captured,
      prospectId: input.prospectId,
      channel: input.channel,
      direction: input.direction,
      summary: input.summary,
      occurredAt: input.occurredAt
    };
    this.interactions.push(interaction);
    return interaction;
  }

  async captureBuyerIntakeRecord(input: BuyerIntakeRecordWrite): Promise<BuyerIntakeRecordWriteResult> {
    const prospect = input.createProspect
      ? await this.createBuyerIntakeProspect(input.createProspect)
      : input.prospectId && input.updateProspect
        ? await this.updateBuyerIntakeProspect(input.prospectId, input.updateProspect)
        : null;
    if (!prospect) throw new Error("buyer intake prospect write failed");
    const interaction = await this.createBuyerIntakeInteraction({
      prospectId: prospect.id,
      channel: input.interaction.channel,
      direction: input.interaction.direction,
      summary: input.interaction.summary,
      occurredAt: input.interaction.occurredAt
    });
    return { prospect, interaction };
  }

  async findLatestInteraction(prospectId: number): Promise<ProspectInteraction | null> {
    return this.interactions
      .filter((item) => item.prospectId === prospectId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0] ?? null;
  }

  async resolvePreCallBriefLookup(lookup: PreCallBriefLookup) {
    if (lookup.taskId) {
      const task = await this.findCallTaskById(lookup.taskId);
      if (!task) return { status: "not_found" as const, prospect: null, task: null, matches: [] };
      const prospect = await this.findProspectById(task.prospectId);
      return prospect
        ? { status: "found" as const, prospect, task, matches: [] }
        : { status: "not_found" as const, prospect: null, task, matches: [] };
    }
    if (lookup.prospectId) {
      const prospect = await this.findProspectById(lookup.prospectId);
      return prospect
        ? { status: "found" as const, prospect, task: null, matches: [] }
        : { status: "not_found" as const, prospect: null, task: null, matches: [] };
    }
    if (lookup.query) {
      const matches = await this.searchProspects(lookup.query, 5);
      if (matches.length === 1) return { status: "found" as const, prospect: matches[0], task: null, matches: [] };
      return {
        status: matches.length ? "ambiguous" as const : "not_found" as const,
        prospect: null,
        task: null,
        matches
      };
    }
    return { status: "not_found" as const, prospect: null, task: null, matches: [] };
  }

  async capturePostCall(input: PostCallCaptureWrite): Promise<PostCallCaptureWriteResult> {
    this.captured += 1;
    const interactionId = this.captured;
    this.interactions.push({
      id: interactionId,
      prospectId: input.prospectId,
      channel: "phone",
      direction: "outbound",
      summary: input.summary,
      occurredAt: new Date("2026-06-24T17:00:00Z")
    });

    const prospect = this.candidates.find((candidate) => candidate.id === input.prospectId);
    const updates: string[] = [];
    if (prospect) {
      prospect.lastOutcome = input.outcome;
      updates.push("last_outcome");
      prospect.nextActionType = input.nextActionType;
      updates.push("next_action_type");
      prospect.nextActionAt = input.nextActionAt;
      updates.push("next_action_at");
      if (input.outcome === "do_not_contact") {
        prospect.doNotContact = true;
        prospect.status = "do_not_contact";
        updates.push("do_not_contact", "status");
      } else if (input.outcome === "wrong_number") {
        prospect.status = "needs_contact_update";
        updates.push("status");
      }
    }

    let taskStatus = null;
    if (input.taskId) {
      const task = this.tasks.find((item) => item.id === input.taskId);
      if (task) {
        task.status = "completed";
        taskStatus = task.status;
      }
    }

    return {
      interactionId,
      prospectId: input.prospectId,
      taskId: input.taskId,
      taskStatus,
      prospectUpdates: updates
    };
  }

  async findFollowUpContext(interactionId: number): Promise<FollowUpContext | null> {
    const interaction = this.interactions.find((item) => item.id === interactionId);
    if (!interaction?.id) return null;
    const prospect = await this.findProspectById(interaction.prospectId);
    return prospect ? { prospect, interaction: { ...interaction, id: interaction.id } } : null;
  }

  async findActiveFollowUpDraft(interactionId: number, channel: FollowUpChannel): Promise<FollowUpDraftRecord | null> {
    return this.drafts.find((item) =>
      item.interactionId === interactionId &&
      item.channel === channel &&
      (item.status === "draft" || item.status === "approved")
    ) ?? null;
  }

  async createFollowUpDraft(input: FollowUpDraftWrite): Promise<FollowUpDraftRecord> {
    const now = new Date("2026-06-24T18:00:00Z");
    const nextId = this.drafts.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const created: FollowUpDraftRecord = {
      id: nextId,
      prospectId: input.prospectId,
      interactionId: input.interactionId,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      sentAt: null,
      sentBy: null,
      sentVia: null,
      externalMessageId: null,
      auditOnlyReason: null,
      sentInteractionId: null,
      createdAt: now,
      updatedAt: now
    };
    this.drafts.push(created);
    return created;
  }

  async findFollowUpDraftById(draftId: number): Promise<FollowUpDraftRecord | null> {
    return this.drafts.find((item) => item.id === draftId) ?? null;
  }

  async markFollowUpDraft(draftId: number, status: "approved" | "discarded", approvedBy?: string): Promise<FollowUpDraftRecord | null> {
    const draft = this.drafts.find((item) => item.id === draftId);
    if (!draft) return null;
    draft.status = status;
    draft.approvedBy = status === "approved" ? approvedBy ?? null : draft.approvedBy;
    draft.approvedAt = status === "approved" ? new Date("2026-06-24T18:30:00Z") : draft.approvedAt;
    draft.updatedAt = new Date("2026-06-24T18:30:00Z");
    return draft;
  }

  async listPendingFollowUpDrafts(limit: number): Promise<FollowUpDraftRecord[]> {
    return this.drafts
      .filter((item) => item.status === "draft")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
      .slice(0, limit);
  }

  async listApprovedFollowUpDraftsAwaitingSend(limit: number, options: { includeDoNotContact?: boolean } = {}) {
    return this.drafts
      .filter((draft) => draft.status === "approved" && draft.sentInteractionId === null)
      .map((draft) => ({
        draft,
        prospect: this.candidates.find((candidate) => candidate.id === draft.prospectId) ?? null
      }))
      .filter((item) => options.includeDoNotContact !== false || !item.prospect?.doNotContact)
      .sort((a, b) => {
        const aApproved = a.draft.approvedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const bApproved = b.draft.approvedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        return aApproved - bApproved || a.draft.updatedAt.getTime() - b.draft.updatedAt.getTime() || a.draft.id - b.draft.id;
      })
      .slice(0, limit);
  }

  async logManualFollowUpSent(input: ManualFollowUpSentWrite) {
    const draft = this.drafts.find((item) => item.id === input.draftId);
    if (!draft) return null;
    const prospect = this.candidates.find((candidate) => candidate.id === draft.prospectId) ?? null;

    if ((draft.status === "manual_sent" || draft.status === "sent") && draft.sentInteractionId !== null) {
      return { draft, prospect, interactionId: draft.sentInteractionId, blockedReason: null };
    }

    if (draft.status !== "approved") {
      return {
        draft,
        prospect,
        interactionId: draft.sentInteractionId,
        blockedReason: `Draft status is ${draft.status}; only approved drafts can be logged as sent.`
      };
    }

    if (prospect?.doNotContact && !input.auditOnlyReason) {
      return { draft, prospect, interactionId: null, blockedReason: "audit_only_reason is required for do-not-contact prospects." };
    }

    this.captured += 1;
    const interactionId = this.captured;
    const auditOnly = Boolean(prospect?.doNotContact);
    this.interactions.push({
      id: interactionId,
      prospectId: draft.prospectId,
      channel: input.sentVia,
      direction: "outbound",
      summary: [
        auditOnly ? "Audit-only manual follow-up sent record." : "Manual follow-up sent.",
        `Draft ${draft.id} confirmed by ${input.confirmedBy}.`,
        input.externalMessageId ? "External reference recorded." : null,
        input.auditOnlyReason ? `Reason: ${input.auditOnlyReason}` : null
      ].filter(Boolean).join(" "),
      occurredAt: input.sentAt
    });

    draft.status = "manual_sent";
    draft.sentAt = input.sentAt;
    draft.sentBy = input.confirmedBy;
    draft.sentVia = input.sentVia;
    draft.externalMessageId = input.externalMessageId;
    draft.auditOnlyReason = input.auditOnlyReason;
    draft.sentInteractionId = interactionId;
    draft.updatedAt = new Date("2026-06-24T19:00:00Z");
    return { draft, prospect, interactionId, blockedReason: null };
  }

  async listStaleProspectCandidates(salesDay: string, limit: number, options: { includeDormant?: boolean } = {}): Promise<ProspectCandidate[]> {
    const salesTime = Date.parse(`${salesDay}T00:00:00.000Z`);
    return this.candidates
      .filter((candidate) => {
        const overdue = candidate.nextActionAt ? candidate.nextActionAt.toISOString().slice(0, 10) < salesDay : false;
        const stale = candidate.lastInteractionAt
          ? salesTime - candidate.lastInteractionAt.getTime() >= 30 * 24 * 60 * 60 * 1000
          : options.includeDormant !== false;
        const dormant = options.includeDormant !== false && !candidate.nextActionAt && stale;
        return overdue || stale || dormant;
      })
      .sort((a, b) => {
        const aDue = a.nextActionAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const bDue = b.nextActionAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const aLast = a.lastInteractionAt?.getTime() ?? 0;
        const bLast = b.lastInteractionAt?.getTime() ?? 0;
        return aDue - bDue || aLast - bLast || b.priority - a.priority || a.id - b.id;
      })
      .slice(0, limit);
  }

  async stageProspectCandidates(input: StageProspectCandidatesWrite) {
    const now = new Date("2026-06-24T20:00:00Z");
    const runId = this.sourcingRuns.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const run: ProspectSourcingRunRecord = {
      id: runId,
      source: input.source,
      enrichmentSource: input.enrichmentSource,
      area: input.area,
      keyword: input.keyword,
      status: "staged",
      requestedBy: input.requestedBy,
      candidateCount: input.candidates.length,
      recommendedCount: input.candidates.filter((candidate) => candidate.reviewStatus === "recommended").length,
      warnings: input.warnings,
      createdAt: now,
      updatedAt: now
    };
    this.sourcingRuns.push(run);

    const candidates = input.candidates.map((candidate, index): ProspectSourceCandidateRecord => ({
      id: this.sourcingCandidates.reduce((max, item) => Math.max(max, item.id), 0) + index + 1,
      sourcingRunId: runId,
      businessName: candidate.businessName,
      company: candidate.company,
      area: candidate.area,
      phone: candidate.phone,
      email: candidate.email,
      website: candidate.website,
      sourceUrl: candidate.sourceUrl,
      enrichmentUrl: candidate.enrichmentUrl,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      buyerType: candidate.buyerType,
      leadSource: candidate.leadSource,
      enrichmentSource: candidate.enrichmentSource,
      qualityScore: candidate.qualityScore,
      reviewStatus: candidate.reviewStatus,
      dedupeStatus: candidate.dedupeStatus,
      dedupeReason: candidate.dedupeReason,
      reviewNotes: candidate.reviewNotes,
      approvedBy: null,
      approvedAt: null,
      promotedProspectId: null,
      createdAt: now,
      updatedAt: now
    }));
    this.sourcingCandidates.push(...candidates);
    return { run, candidates };
  }

  async reviewProspectCandidates(input: ReviewProspectCandidatesInput): Promise<ReviewProspectCandidatesResult> {
    const filtered = this.sourcingCandidates
      .filter((candidate) => input.sourcingRunId === undefined || candidate.sourcingRunId === input.sourcingRunId)
      .filter((candidate) => input.status === undefined || candidate.reviewStatus === input.status);
    const countsBase = this.sourcingCandidates.filter((candidate) => input.sourcingRunId === undefined || candidate.sourcingRunId === input.sourcingRunId);
    return {
      status: "ok",
      items: filtered.slice(0, input.limit ?? 15),
      counts: {
        recommended: countsBase.filter((candidate) => candidate.reviewStatus === "recommended").length,
        needsReview: countsBase.filter((candidate) => candidate.reviewStatus === "needs_review").length,
        duplicate: countsBase.filter((candidate) => candidate.reviewStatus === "duplicate").length,
        rejected: countsBase.filter((candidate) => candidate.reviewStatus === "rejected").length,
        approved: countsBase.filter((candidate) => candidate.reviewStatus === "approved").length
      },
      warnings: [],
      outboundSent: false
    };
  }

  async findProspectSourceCandidateById(candidateId: number): Promise<ProspectSourceCandidateRecord | null> {
    return this.sourcingCandidates.find((candidate) => candidate.id === candidateId) ?? null;
  }

  async promoteProspectCandidate(input: PromoteProspectCandidateWrite) {
    const candidate = this.sourcingCandidates.find((item) => item.id === input.candidateId);
    if (!candidate) {
      return {
        status: "not_found" as const,
        candidateId: input.candidateId,
        prospectId: null,
        callTaskId: null,
        warnings: ["candidate not found."],
        outboundSent: false as const
      };
    }

    let prospectId = candidate.promotedProspectId;
    if (!prospectId) {
      prospectId = this.candidates.reduce((max, item) => Math.max(max, item.id), 0) + 1;
      this.candidates.push({
        id: prospectId,
        name: candidate.businessName,
        company: candidate.company,
        email: candidate.email,
        phone: candidate.phone,
        status: "active",
        notes: [
          `Sourced via ${candidate.leadSource}.`,
          candidate.enrichmentSource ? `Enriched via ${candidate.enrichmentSource}.` : null,
          candidate.reviewNotes
        ].filter(Boolean).join(" "),
        agiledContactId: null,
        preferredChannel: "phone",
        doNotContact: false,
        lastOutcome: null,
        nextActionType: "initial_outreach",
        nextActionAt: null,
        priority: 1,
        updatedAt: new Date("2026-06-24T20:00:00Z"),
        lastInteractionAt: null
      });
      candidate.promotedProspectId = prospectId;
    }

    candidate.reviewStatus = "approved";
    candidate.approvedBy = input.approvedBy;
    candidate.approvedAt = new Date("2026-06-24T20:30:00Z");
    candidate.updatedAt = candidate.approvedAt;

    let callTaskId: number | null = null;
    if (input.createCallTask) {
      const existing = this.tasks.find((task) => task.prospectId === prospectId && task.status === "open");
      if (existing) {
        callTaskId = existing.id;
      } else {
        const created = await this.createCallTask({
          prospectId,
          priority: 1,
          reason: `New sourced prospect from ${candidate.leadSource}.`,
          callObjective: "Initial outreach to qualify buying interest.",
          dueAt: "2026-06-24T20:00:00Z"
        });
        callTaskId = created.id;
      }
    }

    return {
      status: "promoted" as const,
      candidateId: input.candidateId,
      prospectId,
      callTaskId,
      warnings: [],
      outboundSent: false as const
    };
  }

  async seedEmailEnrichmentQueue(input: EmailEnrichmentSeedWrite) {
    let insertedCount = 0;
    let syncedExistingEmailCount = 0;
    let resetClaimedCount = 0;
    const source = input.sourceLabel.toLowerCase();

    for (const item of this.emailEnrichment) {
      if (
        input.resetClaimedOlderThanMinutes &&
        item.status === "claimed" &&
        item.claimedAt &&
        Date.now() - item.claimedAt.getTime() > input.resetClaimedOlderThanMinutes * 60 * 1000
      ) {
        item.status = "pending";
        item.claimedBy = null;
        item.claimedAt = null;
        resetClaimedCount += 1;
      }
      const prospect = this.candidates.find((candidate) => candidate.id === item.prospectId);
      if (prospect?.email && ["pending", "claimed", "error"].includes(item.status)) {
        item.status = "email_found";
        item.verifiedEmail = prospect.email;
        item.confidence = "official";
        item.lastCheckedAt = new Date("2026-06-24T21:30:00Z");
        syncedExistingEmailCount += 1;
      }
    }

    const exactProspectScope = input.prospectIds !== undefined;
    const scopedIds = new Set(input.prospectIds ?? []);
    const eligible = this.candidates.filter((candidate) =>
      candidate.status !== "archived" &&
      (
        (exactProspectScope && scopedIds.has(candidate.id)) ||
        (!exactProspectScope && (
          candidate.notes?.toLowerCase().includes(source) ||
          candidate.company?.toLowerCase().includes(source) ||
          candidate.name?.toLowerCase().includes(source)
        ))
      )
    );

    for (const candidate of eligible) {
      const candidateWebsite = this.candidateWebsite(candidate);
      const existing = this.emailEnrichment.find((item) => item.prospectId === candidate.id);
      if (existing) {
        if (!existing.candidateWebsite && candidateWebsite) existing.candidateWebsite = candidateWebsite;
        continue;
      }
      insertedCount += 1;
      this.emailEnrichment.push({
        queueId: this.emailEnrichment.reduce((max, item) => Math.max(max, item.queueId), 0) + 1,
        prospectId: candidate.id,
        sourceBatch: input.sourceBatch,
        status: candidate.email ? "email_found" : "pending",
        displayName: candidate.name ?? candidate.company ?? `Prospect ${candidate.id}`,
        company: candidate.company,
        phone: candidate.phone,
        currentEmail: candidate.email,
        notesExcerpt: candidate.notes,
        candidateWebsite,
        contactPageUrl: null,
        evidenceSourceUrl: null,
        verifiedEmail: candidate.email,
        confidence: candidate.email ? "official" : null,
        evidenceNote: null,
        attemptCount: 0,
        claimedBy: null,
        claimedAt: null,
        lastCheckedAt: candidate.email ? new Date("2026-06-24T21:30:00Z") : null,
        lastError: null
      });
    }

    return {
      status: "ok" as const,
      insertedCount,
      alreadyQueuedCount: eligible.length - insertedCount,
      syncedExistingEmailCount,
      resetClaimedCount,
      warnings: [],
      outboundSent: false as const
    };
  }

  async recordProspectImportRun(input: ProspectImportRunWrite) {
    const id = this.prospectImportRuns.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    this.prospectImportRuns.push({
      ...input,
      id,
      createdAt: new Date(`2026-06-25T12:${String(id).padStart(2, "0")}:00Z`)
    });
    return { id };
  }

  async claimEmailEnrichmentBatch(input: EmailEnrichmentClaimWrite) {
    for (const item of this.emailEnrichment) {
      const prospect = this.candidates.find((candidate) => candidate.id === item.prospectId);
      if (prospect?.email && ["pending", "claimed", "error"].includes(item.status)) {
        item.status = "email_found";
        item.verifiedEmail = prospect.email;
        item.confidence = "official";
        item.lastCheckedAt = new Date("2026-06-24T21:35:00Z");
      }
    }

    const claimable = this.emailEnrichment
      .filter((item) => !input.sourceBatch || item.sourceBatch === input.sourceBatch)
      .filter((item) => {
        const prospect = this.candidates.find((candidate) => candidate.id === item.prospectId);
        if (prospect?.email) return false;
        return item.status === "pending" || item.status === "error" || (input.includeNeedsReview && item.status === "needs_review");
      })
      .sort((a, b) => a.queueId - b.queueId)
      .slice(0, input.limit);

    for (const item of claimable) {
      item.status = "claimed";
      item.claimedBy = input.claimedBy;
      item.claimedAt = new Date("2026-06-24T21:40:00Z");
      item.attemptCount += 1;
    }

    return {
      status: "ok" as const,
      claimedCount: claimable.length,
      items: claimable,
      warnings: [],
      outboundSent: false as const
    };
  }

  async applyEmailEnrichmentResult(input: EmailEnrichmentApplyWrite) {
    const item = this.emailEnrichment.find((queueItem) => queueItem.prospectId === input.prospectId);
    const prospect = this.candidates.find((candidate) => candidate.id === input.prospectId);
    if (!item || !prospect) {
      return {
        status: "not_found" as const,
        prospectId: input.prospectId,
        queueId: item?.queueId ?? null,
        prospectEmailUpdated: false,
        warnings: ["No email enrichment queue row exists for this prospect."],
        outboundSent: false as const
      };
    }

    const hadEmail = Boolean(prospect.email);
    const shouldUpdateEmail = input.status === "email_found" && Boolean(input.verifiedEmail) && !hadEmail;
    if (shouldUpdateEmail) {
      prospect.email = input.verifiedEmail;
      prospect.preferredChannel = prospect.preferredChannel ?? "email";
      const note = [
        `Email enrichment: found ${input.verifiedEmail}.`,
        input.evidenceSourceUrl ? `Source: ${input.evidenceSourceUrl}.` : null,
        input.evidenceNote
      ].filter(Boolean).join(" ");
      if (note && !(prospect.notes ?? "").includes(note)) {
        prospect.notes = [prospect.notes, note].filter(Boolean).join("\n");
      }
    }

    item.status = input.status as EmailEnrichmentStatus;
    item.claimedBy = null;
    item.claimedAt = null;
    item.lastCheckedAt = new Date("2026-06-24T21:45:00Z");
    item.candidateWebsite = input.candidateWebsite ?? item.candidateWebsite;
    item.contactPageUrl = input.contactPageUrl ?? item.contactPageUrl;
    item.evidenceSourceUrl = input.evidenceSourceUrl ?? item.evidenceSourceUrl;
    item.verifiedEmail = input.verifiedEmail ?? item.verifiedEmail;
    item.confidence = input.confidence as EmailEnrichmentConfidence | null;
    item.evidenceNote = input.evidenceNote ?? item.evidenceNote;
    item.lastError = input.status === "error" ? input.lastError : null;

    return {
      status: "applied" as const,
      prospectId: input.prospectId,
      queueId: item.queueId,
      prospectEmailUpdated: shouldUpdateEmail,
      warnings: hadEmail && input.status === "email_found" ? ["Prospect already had an email; queue was updated but prospect.email was left unchanged."] : [],
      outboundSent: false as const
    };
  }

  async getEmailEnrichmentSummary(sourceBatch?: string | null) {
    const items = this.emailEnrichment.filter((item) => !sourceBatch || item.sourceBatch === sourceBatch);
    const count = (status: EmailEnrichmentStatus) => items.filter((item) => item.status === status).length;
    const counts = {
      pending: count("pending"),
      claimed: count("claimed"),
      websiteFound: count("website_found"),
      emailFound: count("email_found"),
      noEmailFound: count("no_email_found"),
      needsReview: count("needs_review"),
      error: count("error"),
      skipped: count("skipped")
    };
    const completedOnceCount = counts.websiteFound + counts.emailFound + counts.noEmailFound + counts.needsReview + counts.skipped;
    return {
      status: "ok" as const,
      sourceBatch: sourceBatch ?? null,
      total: items.length,
      counts,
      remainingCount: Math.max(0, items.length - completedOnceCount),
      completedOnceCount,
      warnings: [],
      outboundSent: false as const
    };
  }

  async getLatestEmailEnrichmentBatch(): Promise<ProspectImportBatchLookupResult> {
    const latestRun = [...this.prospectImportRuns]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0];
    if (latestRun) {
      const summary = await this.getEmailEnrichmentSummary(latestRun.sourceBatch);
      return {
        status: "found",
        sourceBatch: latestRun.sourceBatch,
        sourceLabel: latestRun.sourceLabel,
        importRunId: latestRun.id,
        importedAt: latestRun.createdAt,
        filePath: latestRun.filePath,
        originalFilename: latestRun.originalFilename,
        totalRows: latestRun.totalRows,
        queuedCount: summary.total,
        imported: {
          created: latestRun.createdCount,
          updated: latestRun.updatedCount,
          needsReview: latestRun.needsReviewCount,
          rejected: latestRun.rejectedCount
        },
        counts: summary.counts,
        remainingCount: summary.remainingCount,
        completedOnceCount: summary.completedOnceCount,
        latestQueuedAt: latestRun.createdAt,
        suggestedTelegramCommand: `continue enrichment batch ${latestRun.sourceBatch}, 10 rows`,
        warnings: [],
        outboundSent: false
      };
    }
    const latest = [...this.emailEnrichment]
      .filter((item) => item.sourceBatch)
      .sort((a, b) => b.queueId - a.queueId)[0];
    if (!latest) {
      return {
        status: "not_found",
        sourceBatch: null,
        sourceLabel: null,
        importRunId: null,
        importedAt: null,
        filePath: null,
        originalFilename: null,
        totalRows: null,
        queuedCount: 0,
        imported: {
          created: null,
          updated: null,
          needsReview: null,
          rejected: null
        },
        counts: {
          pending: 0,
          claimed: 0,
          websiteFound: 0,
          emailFound: 0,
          noEmailFound: 0,
          needsReview: 0,
          error: 0,
          skipped: 0
        },
        remainingCount: 0,
        completedOnceCount: 0,
        latestQueuedAt: null,
        suggestedTelegramCommand: null,
        warnings: ["No enrichment batches exist yet."],
        outboundSent: false
      };
    }
    const summary = await this.getEmailEnrichmentSummary(latest.sourceBatch);
    return {
      status: "found",
      sourceBatch: latest.sourceBatch,
      sourceLabel: null,
      importRunId: null,
      importedAt: null,
      filePath: null,
      originalFilename: null,
      totalRows: null,
      queuedCount: summary.total,
      imported: {
        created: null,
        updated: null,
        needsReview: null,
        rejected: null
      },
      counts: summary.counts,
      remainingCount: summary.remainingCount,
      completedOnceCount: summary.completedOnceCount,
      latestQueuedAt: latest.lastCheckedAt ?? latest.claimedAt,
      suggestedTelegramCommand: `continue enrichment batch ${latest.sourceBatch}, 10 rows`,
      warnings: ["Import created/updated row counts are not yet tracked in a durable import ledger."],
      outboundSent: false
    };
  }

  async storeProspectResearchEvidence(input: ProspectResearchEvidenceWrite): Promise<ProspectResearchEvidenceRecord> {
    const existing = this.researchEvidence.find((item) =>
      item.prospectId === input.prospectId &&
      item.sourceType === input.sourceType &&
      (item.sourceUrl ?? "") === (input.sourceUrl ?? "") &&
      (item.foundEmail ?? "") === (input.foundEmail ?? "") &&
      (item.businessContextNote ?? "") === (input.businessContextNote ?? "")
    );
    if (existing) {
      existing.researchRunId = input.researchRunId ?? existing.researchRunId;
      existing.sourceTitle = input.sourceTitle ?? existing.sourceTitle;
      existing.foundPhone = input.foundPhone ?? existing.foundPhone;
      existing.searchLocationNote = input.searchLocationNote ?? existing.searchLocationNote;
      existing.evidenceNote = input.evidenceNote ?? existing.evidenceNote;
      existing.confidence = input.confidence;
      existing.updatedAt = new Date("2026-07-04T16:00:00Z");
      return existing;
    }
    const now = new Date("2026-07-04T15:45:00Z");
    const record: ProspectResearchEvidenceRecord = {
      evidenceId: this.researchEvidence.reduce((max, item) => Math.max(max, item.evidenceId), 0) + 1,
      prospectId: input.prospectId,
      researchRunId: input.researchRunId ?? null,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      foundEmail: input.foundEmail,
      foundPhone: input.foundPhone,
      businessContextNote: input.businessContextNote,
      searchLocationNote: input.searchLocationNote,
      evidenceNote: input.evidenceNote,
      confidence: input.confidence,
      reviewStatus: "pending_review",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      promotedAt: null,
      promotedTo: null,
      createdAt: now,
      updatedAt: now
    };
    this.researchEvidence.push(record);
    return record;
  }

  async claimProspectResearchBatch(input: { limit: number }): Promise<ProspectResearchClaimResult> {
    const latestEvidence = new Map<number, Date>();
    for (const item of this.researchEvidence) {
      const existing = latestEvidence.get(item.prospectId);
      if (!existing || item.createdAt > existing) {
        latestEvidence.set(item.prospectId, item.createdAt);
      }
    }

    const claimed = this.candidates
      .filter((item) => item.status !== "archived")
      .map((item) => {
        const missingEmail = !item.email?.trim();
        const hasPublicClue = Boolean(
          item.phone?.trim() ||
          item.notes?.match(/https?:\/\/|www\.|website|contact|chamber|directory/i)
        );
        const latestEvidenceAt = latestEvidence.get(item.id) ?? null;
        return {
          prospectId: item.id,
          displayName: item.name || item.company || `Prospect ${item.id}`,
          company: item.company,
          email: item.email,
          phone: item.phone,
          status: item.status,
          priority: item.priority,
          missingEmail,
          hasPublicClue,
          latestEvidenceAt,
          researchReason: missingEmail
            ? hasPublicClue
              ? "Missing email with public contact clue."
              : "Missing email; needs public source research."
            : "Existing email; business-context refresh candidate."
        };
      })
      .sort((a, b) =>
        Number(b.missingEmail) - Number(a.missingEmail) ||
        Number(b.hasPublicClue) - Number(a.hasPublicClue) ||
        (a.latestEvidenceAt?.getTime() ?? 0) - (b.latestEvidenceAt?.getTime() ?? 0) ||
        b.priority - a.priority ||
        a.prospectId - b.prospectId
      )
      .slice(0, input.limit);

    return {
      status: "ok" as const,
      items: claimed,
      warnings: [],
      outboundSent: false as const
    };
  }

  async listProspectResearchEvidence(input: ProspectResearchEvidenceListInput & { limit: number }): Promise<ProspectResearchEvidenceListResult> {
    const items = this.researchEvidence
      .filter((item) => !input.prospectId || item.prospectId === input.prospectId)
      .filter((item) => !input.reviewStatus || item.reviewStatus === input.reviewStatus)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.evidenceId - a.evidenceId)
      .slice(0, input.limit);
    return {
      status: "ok" as const,
      items,
      warnings: [],
      outboundSent: false as const
    };
  }
}
