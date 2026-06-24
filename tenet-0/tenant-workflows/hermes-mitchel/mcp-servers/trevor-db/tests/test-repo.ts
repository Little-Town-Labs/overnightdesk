import type {
  CallTaskStatus,
  ExistingCallTask,
  PreCallBriefLookup,
  ProspectCandidate,
  ProspectInteraction,
  QueueRepository
} from "../src/types.js";

export class FakeQueueRepository implements QueueRepository {
  public tasks: ExistingCallTask[] = [];
  public interactions: ProspectInteraction[] = [];
  public created = 0;

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
}
