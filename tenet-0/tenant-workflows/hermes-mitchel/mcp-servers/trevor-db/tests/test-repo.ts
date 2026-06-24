import type {
  CallTaskStatus,
  ExistingCallTask,
  FollowUpChannel,
  FollowUpContext,
  FollowUpDraftRecord,
  FollowUpDraftWrite,
  PreCallBriefLookup,
  PostCallCaptureWrite,
  PostCallCaptureWriteResult,
  ProspectCandidate,
  ProspectInteraction,
  QueueRepository
} from "../src/types.js";

export class FakeQueueRepository implements QueueRepository {
  public tasks: ExistingCallTask[] = [];
  public interactions: ProspectInteraction[] = [];
  public drafts: FollowUpDraftRecord[] = [];
  public created = 0;
  public captured = 0;

  constructor(public candidates: ProspectCandidate[]) {}

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
}
