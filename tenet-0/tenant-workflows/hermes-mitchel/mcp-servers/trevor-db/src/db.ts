import pg from "pg";
import type {
  BriefLookupResult,
  CallTaskRecord,
  CallTaskStatus,
  ExistingCallTask,
  PreCallBriefLookup,
  ProspectCandidate,
  ProspectInteraction,
  QueueRepository
} from "./types.js";

const { Pool } = pg;

export function createPool(): pg.Pool {
  const dbUrl = process.env.TREVOR_DB_URL;
  if (!dbUrl) {
    throw new Error("TREVOR_DB_URL environment variable is required");
  }
  return new Pool({ connectionString: dbUrl });
}

function toCandidate(row: Record<string, unknown>): ProspectCandidate {
  return {
    id: Number(row.id),
    name: row.name as string | null,
    company: row.company as string | null,
    email: row.email as string | null,
    phone: row.phone as string | null,
    status: row.status as string | null,
    notes: row.notes as string | null,
    agiledContactId: row.agiled_contact_id as string | null,
    preferredChannel: row.preferred_channel as string | null,
    doNotContact: Boolean(row.do_not_contact),
    lastOutcome: row.last_outcome as string | null,
    nextActionType: row.next_action_type as string | null,
    nextActionAt: row.next_action_at ? new Date(row.next_action_at as string) : null,
    priority: Number(row.priority ?? 0),
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : null,
    lastInteractionAt: row.last_interaction_at ? new Date(row.last_interaction_at as string) : null
  };
}

function toTask(row: Record<string, unknown>): ExistingCallTask {
  return {
    id: Number(row.id),
    prospectId: Number(row.prospect_id),
    status: row.status as CallTaskStatus,
    dueAt: row.due_at ? new Date(row.due_at as string) : null
  };
}

function toTaskRecord(row: Record<string, unknown>): CallTaskRecord {
  return {
    ...toTask(row),
    priority: Number(row.priority ?? 0),
    reason: row.reason as string | null,
    callObjective: row.call_objective as string | null
  };
}

function toInteraction(row: Record<string, unknown>): ProspectInteraction {
  return {
    prospectId: Number(row.prospect_id),
    channel: row.channel as string | null,
    direction: row.direction as string | null,
    summary: row.summary as string | null,
    occurredAt: new Date(row.occurred_at as string)
  };
}

export class PgQueueRepository implements QueueRepository {
  constructor(private readonly pool: pg.Pool) {}

  async listProspectCandidates(
    salesDay: string,
    limit: number,
    options: { callableOnly?: boolean } = {}
  ): Promise<ProspectCandidate[]> {
    const callableFilter = options.callableOnly ? "and coalesce(p.do_not_contact, false) = false and nullif(trim(p.phone), '') is not null" : "";
    const result = await this.pool.query(
      `
      select
        p.*,
        max(i.occurred_at) as last_interaction_at
      from trevor.prospects p
      left join trevor.interactions i on i.prospect_id = p.id
      where coalesce(p.status, 'active') <> 'archived'
        ${callableFilter}
      group by p.id
      order by
        case when p.next_action_at is not null and p.next_action_at::date <= $1::date then 1 else 0 end desc,
        p.priority desc,
        p.next_action_at asc nulls last,
        p.updated_at desc,
        p.id asc
      limit $2
      `,
      [salesDay, limit]
    );
    return result.rows.map(toCandidate);
  }

  async findOpenCallTask(prospectId: number, salesDay: string): Promise<ExistingCallTask | null> {
    const result = await this.pool.query(
      `
      select id, prospect_id, status, due_at
      from trevor.call_tasks
      where prospect_id = $1
        and task_type = 'call'
        and status = 'open'
        and due_at::date = $2::date
      order by updated_at desc, id asc
      limit 1
      `,
      [prospectId, salesDay]
    );
    return result.rows[0] ? toTask(result.rows[0]) : null;
  }

  async createCallTask(input: {
    prospectId: number;
    priority: number;
    reason: string;
    callObjective: string;
    dueAt: string;
  }): Promise<ExistingCallTask> {
    const result = await this.pool.query(
      `
      insert into trevor.call_tasks (prospect_id, task_type, priority, reason, call_objective, status, due_at)
      values ($1, 'call', $2, $3, $4, 'open', $5)
      returning id, prospect_id, status, due_at
      `,
      [input.prospectId, input.priority, input.reason, input.callObjective, input.dueAt]
    );
    return toTask(result.rows[0]);
  }

  async listCallTasks(status: CallTaskStatus, salesDay: string | undefined, limit: number) {
    const params: unknown[] = [status, limit];
    const dayFilter = salesDay ? "and t.due_at::date = $3::date" : "";
    if (salesDay) params.push(salesDay);

    const result = await this.pool.query(
      `
      select
        t.id as task_id,
        t.prospect_id,
        coalesce(nullif(trim(p.name), ''), nullif(trim(p.company), ''), 'Prospect ' || p.id::text) as display_name,
        t.status,
        t.priority,
        t.reason,
        t.call_objective,
        t.due_at,
        t.completed_at
      from trevor.call_tasks t
      join trevor.prospects p on p.id = t.prospect_id
      where t.task_type = 'call'
        and t.status = $1
        ${dayFilter}
      order by t.due_at asc nulls last, t.priority desc, t.updated_at desc, t.id asc
      limit $2
      `,
      params
    );

    return result.rows.map((row) => ({
      taskId: Number(row.task_id),
      prospectId: Number(row.prospect_id),
      displayName: row.display_name as string,
      status: row.status as CallTaskStatus,
      priority: Number(row.priority),
      reason: row.reason as string,
      callObjective: row.call_objective as string | null,
      dueAt: row.due_at ? new Date(row.due_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null
    }));
  }

  async markCallTaskStatus(taskId: number, status: CallTaskStatus) {
    if (status === "open") {
      const blocked = await this.pool.query(
        `
        select t.id
        from trevor.call_tasks t
        join trevor.prospects p on p.id = t.prospect_id
        where t.id = $1
          and t.task_type = 'call'
          and coalesce(p.do_not_contact, false) = true
        limit 1
        `,
        [taskId]
      );
      if (blocked.rowCount) {
        throw new Error("Cannot reopen call task for a do-not-contact prospect");
      }
    }

    const completedAtExpr = status === "completed" ? "now()" : "null";
    const result = await this.pool.query(
      `
      update trevor.call_tasks
      set status = $2,
          completed_at = ${completedAtExpr},
          updated_at = now()
      where id = $1
        and task_type = 'call'
      returning id, status, completed_at
      `,
      [taskId, status]
    );
    const row = result.rows[0];
    return {
      taskId,
      status,
      updated: Boolean(row),
      completedAt: row?.completed_at ? new Date(row.completed_at) : null
    };
  }

  async findCallTaskById(taskId: number): Promise<CallTaskRecord | null> {
    const result = await this.pool.query(
      `
      select id, prospect_id, status, due_at, priority, reason, call_objective
      from trevor.call_tasks
      where id = $1
        and task_type = 'call'
      limit 1
      `,
      [taskId]
    );
    return result.rows[0] ? toTaskRecord(result.rows[0]) : null;
  }

  async findProspectById(prospectId: number): Promise<ProspectCandidate | null> {
    const result = await this.pool.query(
      `
      select
        p.*,
        max(i.occurred_at) as last_interaction_at
      from trevor.prospects p
      left join trevor.interactions i on i.prospect_id = p.id
      where p.id = $1
      group by p.id
      limit 1
      `,
      [prospectId]
    );
    return result.rows[0] ? toCandidate(result.rows[0]) : null;
  }

  async searchProspects(query: string, limit: number): Promise<ProspectCandidate[]> {
    const normalizedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
    const result = await this.pool.query(
      `
      select
        p.*,
        max(i.occurred_at) as last_interaction_at
      from trevor.prospects p
      left join trevor.interactions i on i.prospect_id = p.id
      where coalesce(p.status, 'active') <> 'archived'
        and (
          p.name ilike '%' || $1 || '%'
          or p.company ilike '%' || $1 || '%'
        )
      group by p.id
      order by p.updated_at desc, p.id asc
      limit $2
      `,
      [query.trim(), normalizedLimit]
    );
    return result.rows.map(toCandidate);
  }

  async findLatestInteraction(prospectId: number): Promise<ProspectInteraction | null> {
    const result = await this.pool.query(
      `
      select prospect_id, channel, direction, summary, occurred_at
      from trevor.interactions
      where prospect_id = $1
      order by occurred_at desc, id desc
      limit 1
      `,
      [prospectId]
    );
    return result.rows[0] ? toInteraction(result.rows[0]) : null;
  }

  async resolvePreCallBriefLookup(lookup: PreCallBriefLookup): Promise<BriefLookupResult> {
    if (lookup.taskId) {
      const task = await this.findCallTaskById(lookup.taskId);
      if (!task) return { status: "not_found", prospect: null, task: null, matches: [] };
      const prospect = await this.findProspectById(task.prospectId);
      return prospect
        ? { status: "found", prospect, task, matches: [] }
        : { status: "not_found", prospect: null, task, matches: [] };
    }

    if (lookup.prospectId) {
      const prospect = await this.findProspectById(lookup.prospectId);
      return prospect
        ? { status: "found", prospect, task: null, matches: [] }
        : { status: "not_found", prospect: null, task: null, matches: [] };
    }

    const query = lookup.query?.trim();
    if (query) {
      const matches = await this.searchProspects(query, 5);
      if (matches.length === 1) return { status: "found", prospect: matches[0], task: null, matches: [] };
      return {
        status: matches.length ? "ambiguous" : "not_found",
        prospect: null,
        task: null,
        matches
      };
    }

    return { status: "not_found", prospect: null, task: null, matches: [] };
  }
}
