import type {
  CallTaskStatus,
  ExistingCallTask,
  ProspectCandidate,
  QueueRepository
} from "../src/types.js";

export class FakeQueueRepository implements QueueRepository {
  public tasks: ExistingCallTask[] = [];
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
}
