import pg from "pg";
import {
  findProspectSourceCandidateByIdInDb,
  promoteProspectCandidateInDb,
  reviewProspectCandidatesInDb,
  stageProspectCandidatesInDb
} from "./db-sourcing.js";
import type {
  BriefLookupResult,
  BuyerIntakeInteractionWrite,
  BuyerIntakeLookup,
  BuyerIntakeProspectUpdate,
  BuyerIntakeProspectWrite,
  BuyerIntakeRecordWrite,
  BuyerIntakeRecordWriteResult,
  CallTaskRecord,
  CallTaskStatus,
  ExistingCallTask,
  FollowUpChannel,
  FollowUpContext,
  FollowUpDraftRecord,
  FollowUpDraftWrite,
  ManualFollowUpSentWrite,
  PreCallBriefLookup,
  PostCallCaptureWrite,
  PostCallCaptureWriteResult,
  ProspectCandidate,
  ProspectInteraction,
  ProspectSourceCandidateRecord,
  ProspectSourcingRunRecord,
  QueueRepository,
  ReviewProspectCandidatesInput,
  ReviewProspectCandidatesResult,
  StageProspectCandidatesWrite
} from "./types.js";

const { Pool } = pg;
const FOLLOW_UP_DRAFT_COLUMNS = `
  id,
  prospect_id,
  interaction_id,
  channel,
  subject,
  body,
  status,
  approved_by,
  approved_at,
  sent_at,
  sent_by,
  sent_via,
  external_message_id,
  audit_only_reason,
  sent_interaction_id,
  created_at,
  updated_at
`;

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
    ...(row.id !== undefined && row.id !== null ? { id: Number(row.id) } : {}),
    prospectId: Number(row.prospect_id),
    channel: row.channel as string | null,
    direction: row.direction as string | null,
    summary: row.summary as string | null,
    occurredAt: new Date(row.occurred_at as string)
  };
}

function toFollowUpDraft(row: Record<string, unknown>): FollowUpDraftRecord {
  return {
    id: Number(row.id),
    prospectId: Number(row.prospect_id),
    interactionId: Number(row.interaction_id),
    channel: row.channel as FollowUpChannel,
    subject: row.subject as string | null,
    body: row.body as string,
    status: row.status as FollowUpDraftRecord["status"],
    approvedBy: row.approved_by as string | null,
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
    sentAt: row.sent_at ? new Date(row.sent_at as string) : null,
    sentBy: row.sent_by as string | null,
    sentVia: row.sent_via as string | null,
    externalMessageId: row.external_message_id as string | null,
    auditOnlyReason: row.audit_only_reason as string | null,
    sentInteractionId: row.sent_interaction_id !== undefined && row.sent_interaction_id !== null ? Number(row.sent_interaction_id) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
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

  async findBuyerIntakeMatches(input: BuyerIntakeLookup): Promise<ProspectCandidate[]> {
    const result = await this.pool.query(
      `
      select
        p.*,
        max(i.occurred_at) as last_interaction_at
      from trevor.prospects p
      left join trevor.interactions i on i.prospect_id = p.id
      where coalesce(p.status, 'active') <> 'archived'
        and (
          ($1::text is not null and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = regexp_replace($1::text, '[^0-9]', '', 'g'))
          or ($2::text is not null and lower(coalesce(p.email, '')) = lower($2::text))
          or ($3::text is not null and p.company ilike '%' || $3::text || '%')
          or ($4::text is not null and p.name ilike '%' || $4::text || '%')
        )
      group by p.id
      order by p.updated_at desc, p.id asc
      limit $5
      `,
      [input.phone, input.email, input.company, input.name, Math.max(1, Math.min(10, Math.trunc(input.limit)))]
    );
    return result.rows.map(toCandidate);
  }

  async createBuyerIntakeProspect(input: BuyerIntakeProspectWrite): Promise<ProspectCandidate> {
    const result = await this.pool.query(
      `
      insert into trevor.prospects (
        name,
        company,
        email,
        phone,
        status,
        notes,
        agiled_contact_id,
        preferred_channel,
        do_not_contact,
        last_outcome,
        next_action_type,
        next_action_at,
        priority,
        lead_source
      )
      values ($1, $2, $3, $4, coalesce($5, 'active'), $6, $7, $8, $9, $10, $11, $12, $13, $14)
      returning *
      `,
      [
        input.name,
        input.company,
        input.email,
        input.phone,
        input.status,
        input.notes,
        input.agiledContactId,
        input.preferredChannel,
        input.doNotContact,
        input.lastOutcome,
        input.nextActionType,
        input.nextActionAt,
        input.priority,
        input.leadSource
      ]
    );
    return toCandidate({ ...result.rows[0], last_interaction_at: null });
  }

  async updateBuyerIntakeProspect(prospectId: number, input: BuyerIntakeProspectUpdate): Promise<ProspectCandidate | null> {
    const result = await this.pool.query(
      `
      update trevor.prospects
      set name = coalesce(nullif($2::text, ''), name),
          company = coalesce(nullif($3::text, ''), company),
          email = coalesce(nullif($4::text, ''), email),
          phone = coalesce(nullif($5::text, ''), phone),
          status = coalesce(nullif($6::text, ''), status),
          notes = case
            when nullif($7::text, '') is null then notes
            when nullif(coalesce(notes, ''), '') is null then $7::text
            else notes || E'\n' || $7::text
          end,
          agiled_contact_id = coalesce(nullif($8::text, ''), agiled_contact_id),
          preferred_channel = coalesce(nullif($9::text, ''), preferred_channel),
          do_not_contact = case when $10::boolean is null then do_not_contact else $10::boolean end,
          last_outcome = coalesce(nullif($11::text, ''), last_outcome),
          next_action_type = case when $12::text is null then next_action_type else nullif($12::text, '') end,
          next_action_at = coalesce($13::timestamptz, next_action_at),
          lead_source = coalesce(nullif($14::text, ''), lead_source),
          updated_at = now()
      where id = $1
      returning *
      `,
      [
        prospectId,
        input.name ?? null,
        input.company ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.status ?? null,
        input.notes ?? null,
        input.agiledContactId ?? null,
        input.preferredChannel ?? null,
        input.doNotContact ?? null,
        input.lastOutcome ?? null,
        input.nextActionType ?? null,
        input.nextActionAt ?? null,
        input.leadSource ?? null
      ]
    );
    return result.rows[0] ? toCandidate({ ...result.rows[0], last_interaction_at: null }) : null;
  }

  async createBuyerIntakeInteraction(input: BuyerIntakeInteractionWrite): Promise<ProspectInteraction & { id: number }> {
    const result = await this.pool.query(
      `
      insert into trevor.interactions (prospect_id, channel, direction, summary, occurred_at)
      values ($1, $2, $3, $4, $5)
      returning id, prospect_id, channel, direction, summary, occurred_at
      `,
      [input.prospectId, input.channel, input.direction, input.summary, input.occurredAt]
    );
    const interaction = toInteraction(result.rows[0]);
    return { ...interaction, id: Number(result.rows[0].id) };
  }

  async captureBuyerIntakeRecord(input: BuyerIntakeRecordWrite): Promise<BuyerIntakeRecordWriteResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      let prospect: ProspectCandidate | null = null;
      if (input.createProspect) {
        const result = await client.query(
          `
          insert into trevor.prospects (
            name,
            company,
            email,
            phone,
            status,
            notes,
            agiled_contact_id,
            preferred_channel,
            do_not_contact,
            last_outcome,
            next_action_type,
            next_action_at,
            priority,
            lead_source
          )
          values ($1, $2, $3, $4, coalesce($5, 'active'), $6, $7, $8, $9, $10, $11, $12, $13, $14)
          returning *
          `,
          [
            input.createProspect.name,
            input.createProspect.company,
            input.createProspect.email,
            input.createProspect.phone,
            input.createProspect.status,
            input.createProspect.notes,
            input.createProspect.agiledContactId,
            input.createProspect.preferredChannel,
            input.createProspect.doNotContact,
            input.createProspect.lastOutcome,
            input.createProspect.nextActionType,
            input.createProspect.nextActionAt,
            input.createProspect.priority,
            input.createProspect.leadSource
          ]
        );
        prospect = toCandidate({ ...result.rows[0], last_interaction_at: null });
      } else if (input.prospectId && input.updateProspect) {
        const result = await client.query(
          `
          update trevor.prospects
          set name = coalesce(nullif($2::text, ''), name),
              company = coalesce(nullif($3::text, ''), company),
              email = coalesce(nullif($4::text, ''), email),
              phone = coalesce(nullif($5::text, ''), phone),
              status = coalesce(nullif($6::text, ''), status),
              notes = case
                when nullif($7::text, '') is null then notes
                when nullif(coalesce(notes, ''), '') is null then $7::text
                else notes || E'\n' || $7::text
              end,
              agiled_contact_id = coalesce(nullif($8::text, ''), agiled_contact_id),
              preferred_channel = coalesce(nullif($9::text, ''), preferred_channel),
              do_not_contact = case when $10::boolean is null then do_not_contact else $10::boolean end,
              last_outcome = coalesce(nullif($11::text, ''), last_outcome),
              next_action_type = case when $12::text is null then next_action_type else nullif($12::text, '') end,
              next_action_at = coalesce($13::timestamptz, next_action_at),
              lead_source = coalesce(nullif($14::text, ''), lead_source),
              updated_at = now()
          where id = $1
          returning *
          `,
          [
            input.prospectId,
            input.updateProspect.name ?? null,
            input.updateProspect.company ?? null,
            input.updateProspect.email ?? null,
            input.updateProspect.phone ?? null,
            input.updateProspect.status ?? null,
            input.updateProspect.notes ?? null,
            input.updateProspect.agiledContactId ?? null,
            input.updateProspect.preferredChannel ?? null,
            input.updateProspect.doNotContact ?? null,
            input.updateProspect.lastOutcome ?? null,
            input.updateProspect.nextActionType ?? null,
            input.updateProspect.nextActionAt ?? null,
            input.updateProspect.leadSource ?? null
          ]
        );
        prospect = result.rows[0] ? toCandidate({ ...result.rows[0], last_interaction_at: null }) : null;
      }

      if (!prospect) {
        throw new Error("buyer intake prospect write failed");
      }

      const interactionResult = await client.query(
        `
        insert into trevor.interactions (prospect_id, channel, direction, summary, occurred_at)
        values ($1, $2, $3, $4, $5)
        returning id, prospect_id, channel, direction, summary, occurred_at
        `,
        [prospect.id, input.interaction.channel, input.interaction.direction, input.interaction.summary, input.interaction.occurredAt]
      );
      const interaction = toInteraction(interactionResult.rows[0]);
      await client.query("commit");
      return { prospect, interaction: { ...interaction, id: Number(interactionResult.rows[0].id) } };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async findLatestInteraction(prospectId: number): Promise<ProspectInteraction | null> {
    const result = await this.pool.query(
      `
      select id, prospect_id, channel, direction, summary, occurred_at
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

  async capturePostCall(input: PostCallCaptureWrite): Promise<PostCallCaptureWriteResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const interaction = await client.query(
        `
        insert into trevor.interactions (prospect_id, channel, direction, summary, occurred_at)
        values ($1, 'phone', 'outbound', $2, now())
        returning id
        `,
        [input.prospectId, input.summary]
      );
      const interactionId = Number(interaction.rows[0].id);

      const doNotContact = input.outcome === "do_not_contact";
      const status =
        input.outcome === "do_not_contact" ? "do_not_contact" :
        input.outcome === "wrong_number" ? "needs_contact_update" :
        null;

      const prospectUpdates = ["last_contacted_at", "last_outcome", "next_action_type", "next_action_at"];
      if (doNotContact) prospectUpdates.push("do_not_contact", "do_not_contact_reason", "status");
      if (status && !doNotContact) prospectUpdates.push("status");

      await client.query(
        `
        update trevor.prospects
        set last_contacted_at = now(),
            last_outcome = $2,
            next_action_type = $3,
            next_action_at = $4,
            do_not_contact = case when $5 then true else do_not_contact end,
            do_not_contact_reason = case when $5 then $6 else do_not_contact_reason end,
            status = coalesce($7, status),
            updated_at = now()
        where id = $1
        `,
        [input.prospectId, input.outcome, input.nextActionType, input.nextActionAt, doNotContact, input.summary, status]
      );

      let taskStatus = null;
      if (input.taskId) {
        const task = await client.query(
          `
          update trevor.call_tasks
          set status = 'completed',
              completed_at = now(),
              updated_at = now()
          where id = $1
            and task_type = 'call'
          returning status
          `,
          [input.taskId]
        );
        taskStatus = task.rows[0]?.status ?? null;
      }

      await client.query("commit");
      return {
        interactionId,
        prospectId: input.prospectId,
        taskId: input.taskId,
        taskStatus,
        prospectUpdates
      };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async findFollowUpContext(interactionId: number): Promise<FollowUpContext | null> {
    const result = await this.pool.query(
      `
      select
        p.*,
        max(recent.occurred_at) as last_interaction_at,
        i.id as interaction_id,
        i.prospect_id as interaction_prospect_id,
        i.channel as interaction_channel,
        i.direction as interaction_direction,
        i.summary as interaction_summary,
        i.occurred_at as interaction_occurred_at
      from trevor.interactions i
      join trevor.prospects p on p.id = i.prospect_id
      left join trevor.interactions recent on recent.prospect_id = p.id
      where i.id = $1
      group by p.id, i.id
      limit 1
      `,
      [interactionId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      prospect: toCandidate(row),
      interaction: {
        id: Number(row.interaction_id),
        prospectId: Number(row.interaction_prospect_id),
        channel: row.interaction_channel as string | null,
        direction: row.interaction_direction as string | null,
        summary: row.interaction_summary as string | null,
        occurredAt: new Date(row.interaction_occurred_at)
      }
    };
  }

  async findActiveFollowUpDraft(interactionId: number, channel: FollowUpChannel): Promise<FollowUpDraftRecord | null> {
    const result = await this.pool.query(
      `
      select ${FOLLOW_UP_DRAFT_COLUMNS}
      from trevor.followup_drafts
      where interaction_id = $1
        and channel = $2
        and status in ('draft', 'approved')
      order by updated_at desc, id asc
      limit 1
      `,
      [interactionId, channel]
    );
    return result.rows[0] ? toFollowUpDraft(result.rows[0]) : null;
  }

  async createFollowUpDraft(input: FollowUpDraftWrite): Promise<FollowUpDraftRecord> {
    const result = await this.pool.query(
      `
      insert into trevor.followup_drafts (prospect_id, interaction_id, channel, subject, body, status)
      values ($1, $2, $3, $4, $5, 'draft')
      returning ${FOLLOW_UP_DRAFT_COLUMNS}
      `,
      [input.prospectId, input.interactionId, input.channel, input.subject, input.body]
    );
    return toFollowUpDraft(result.rows[0]);
  }

  async findFollowUpDraftById(draftId: number): Promise<FollowUpDraftRecord | null> {
    const result = await this.pool.query(
      `
      select ${FOLLOW_UP_DRAFT_COLUMNS}
      from trevor.followup_drafts
      where id = $1
      limit 1
      `,
      [draftId]
    );
    return result.rows[0] ? toFollowUpDraft(result.rows[0]) : null;
  }

  async markFollowUpDraft(draftId: number, status: "approved" | "discarded", approvedBy?: string): Promise<FollowUpDraftRecord | null> {
    const result = await this.pool.query(
      `
      update trevor.followup_drafts
      set status = $2,
          approved_by = case when $2 = 'approved' then $3 else approved_by end,
          approved_at = case when $2 = 'approved' then now() else approved_at end,
          updated_at = now()
      where id = $1
        and status in ('draft', 'approved', 'discarded')
      returning ${FOLLOW_UP_DRAFT_COLUMNS}
      `,
      [draftId, status, approvedBy ?? null]
    );
    return result.rows[0] ? toFollowUpDraft(result.rows[0]) : null;
  }

  async listPendingFollowUpDrafts(limit: number): Promise<FollowUpDraftRecord[]> {
    const normalizedLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
    const result = await this.pool.query(
      `
      select ${FOLLOW_UP_DRAFT_COLUMNS}
      from trevor.followup_drafts
      where status = 'draft'
      order by created_at asc, id asc
      limit $1
      `,
      [normalizedLimit]
    );
    return result.rows.map(toFollowUpDraft);
  }

  async listApprovedFollowUpDraftsAwaitingSend(
    limit: number,
    options: { includeDoNotContact?: boolean } = {}
  ): Promise<Array<{ draft: FollowUpDraftRecord; prospect: ProspectCandidate | null }>> {
    const normalizedLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
    const dncFilter = options.includeDoNotContact === false
      ? "and coalesce(p.do_not_contact, false) = false"
      : "";
    const result = await this.pool.query(
      `
      select
        d.id as draft_id,
        d.prospect_id as draft_prospect_id,
        d.interaction_id as draft_interaction_id,
        d.channel as draft_channel,
        d.subject as draft_subject,
        d.body as draft_body,
        d.status as draft_status,
        d.approved_by as draft_approved_by,
        d.approved_at as draft_approved_at,
        d.sent_at as draft_sent_at,
        d.sent_by as draft_sent_by,
        d.sent_via as draft_sent_via,
        d.external_message_id as draft_external_message_id,
        d.audit_only_reason as draft_audit_only_reason,
        d.sent_interaction_id as draft_sent_interaction_id,
        d.created_at as draft_created_at,
        d.updated_at as draft_updated_at,
        p.*,
        max(i.occurred_at) as last_interaction_at
      from trevor.followup_drafts d
      left join trevor.prospects p on p.id = d.prospect_id
      left join trevor.interactions i on i.prospect_id = p.id
      where d.status = 'approved'
        and d.sent_interaction_id is null
        ${dncFilter}
      group by d.id, p.id
      order by d.approved_at asc nulls last, d.updated_at asc, d.id asc
      limit $1
      `,
      [normalizedLimit]
    );
    return result.rows.map((row) => ({
      draft: toFollowUpDraft({
        id: row.draft_id,
        prospect_id: row.draft_prospect_id,
        interaction_id: row.draft_interaction_id,
        channel: row.draft_channel,
        subject: row.draft_subject,
        body: row.draft_body,
        status: row.draft_status,
        approved_by: row.draft_approved_by,
        approved_at: row.draft_approved_at,
        sent_at: row.draft_sent_at,
        sent_by: row.draft_sent_by,
        sent_via: row.draft_sent_via,
        external_message_id: row.draft_external_message_id,
        audit_only_reason: row.draft_audit_only_reason,
        sent_interaction_id: row.draft_sent_interaction_id,
        created_at: row.draft_created_at,
        updated_at: row.draft_updated_at
      }),
      prospect: row.id ? toCandidate(row) : null
    }));
  }

  async logManualFollowUpSent(input: ManualFollowUpSentWrite): Promise<{
    draft: FollowUpDraftRecord;
    prospect: ProspectCandidate | null;
    interactionId: number | null;
    blockedReason: string | null;
  } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const found = await client.query(
        `
        select
          d.id as draft_id,
          d.prospect_id as draft_prospect_id,
          d.interaction_id as draft_interaction_id,
          d.channel as draft_channel,
          d.subject as draft_subject,
          d.body as draft_body,
          d.status as draft_status,
          d.approved_by as draft_approved_by,
          d.approved_at as draft_approved_at,
          d.sent_at as draft_sent_at,
          d.sent_by as draft_sent_by,
          d.sent_via as draft_sent_via,
          d.external_message_id as draft_external_message_id,
          d.audit_only_reason as draft_audit_only_reason,
          d.sent_interaction_id as draft_sent_interaction_id,
          d.created_at as draft_created_at,
          d.updated_at as draft_updated_at,
          p.*,
          recent.last_interaction_at
        from trevor.followup_drafts d
        left join trevor.prospects p on p.id = d.prospect_id
        left join lateral (
          select max(i.occurred_at) as last_interaction_at
          from trevor.interactions i
          where i.prospect_id = p.id
        ) recent on true
        where d.id = $1
        for update of d
        `,
        [input.draftId]
      );
      const row = found.rows[0];
      if (!row) {
        await client.query("commit");
        return null;
      }

      const draft = toFollowUpDraft({
        id: row.draft_id,
        prospect_id: row.draft_prospect_id,
        interaction_id: row.draft_interaction_id,
        channel: row.draft_channel,
        subject: row.draft_subject,
        body: row.draft_body,
        status: row.draft_status,
        approved_by: row.draft_approved_by,
        approved_at: row.draft_approved_at,
        sent_at: row.draft_sent_at,
        sent_by: row.draft_sent_by,
        sent_via: row.draft_sent_via,
        external_message_id: row.draft_external_message_id,
        audit_only_reason: row.draft_audit_only_reason,
        sent_interaction_id: row.draft_sent_interaction_id,
        created_at: row.draft_created_at,
        updated_at: row.draft_updated_at
      });
      const prospect = row.id ? toCandidate(row) : null;

      if ((draft.status === "manual_sent" || draft.status === "sent") && draft.sentInteractionId !== null) {
        await client.query("commit");
        return { draft, prospect, interactionId: draft.sentInteractionId, blockedReason: null };
      }

      if (draft.status !== "approved") {
        await client.query("commit");
        return { draft, prospect, interactionId: draft.sentInteractionId, blockedReason: `Draft status is ${draft.status}; only approved drafts can be logged as sent.` };
      }

      if (prospect?.doNotContact && !input.auditOnlyReason) {
        await client.query("commit");
        return { draft, prospect, interactionId: null, blockedReason: "audit_only_reason is required for do-not-contact prospects." };
      }

      const auditOnly = Boolean(prospect?.doNotContact);
      const summary = [
        auditOnly ? "Audit-only manual follow-up sent record." : "Manual follow-up sent.",
        `Draft ${draft.id} confirmed by ${input.confirmedBy}.`,
        `Channel: ${input.sentVia}.`,
        input.externalMessageId ? "External reference recorded." : null,
        input.auditOnlyReason ? `Reason: ${input.auditOnlyReason}` : null
      ].filter(Boolean).join(" ");
      const inserted = await client.query(
        `
        insert into trevor.interactions (prospect_id, channel, direction, summary, occurred_at)
        values ($1, $2, 'outbound', $3, $4)
        returning id
        `,
        [draft.prospectId, input.sentVia, summary, input.sentAt]
      );
      const interactionId = Number(inserted.rows[0].id);

      const updated = await client.query(
        `
        update trevor.followup_drafts
        set status = 'manual_sent',
            sent_at = $2,
            sent_by = $3,
            sent_via = $4,
            external_message_id = $5,
            audit_only_reason = $6,
            sent_interaction_id = $7,
            updated_at = now()
        where id = $1
        returning ${FOLLOW_UP_DRAFT_COLUMNS}
        `,
        [
          input.draftId,
          input.sentAt,
          input.confirmedBy,
          input.sentVia,
          input.externalMessageId,
          input.auditOnlyReason,
          interactionId
        ]
      );

      await client.query("commit");
      return { draft: toFollowUpDraft(updated.rows[0]), prospect, interactionId, blockedReason: null };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async listStaleProspectCandidates(
    salesDay: string,
    limit: number,
    options: { includeDormant?: boolean } = {}
  ): Promise<ProspectCandidate[]> {
    const normalizedLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
    const dormantFilter = options.includeDormant === false
      ? "and p.next_action_at is not null"
      : "";
    const result = await this.pool.query(
      `
      select
        p.*,
        max(i.occurred_at) as last_interaction_at
      from trevor.prospects p
      left join trevor.interactions i on i.prospect_id = p.id
      where coalesce(p.status, 'active') <> 'archived'
        ${dormantFilter}
      group by p.id
      having
        (p.next_action_at is not null and p.next_action_at::date < $1::date)
        or max(i.occurred_at) is null
        or max(i.occurred_at)::date <= ($1::date - interval '30 days')
      order by
        case when p.next_action_at is not null and p.next_action_at::date < $1::date then 0 else 1 end asc,
        p.next_action_at asc nulls last,
        max(i.occurred_at) asc nulls first,
        p.priority desc,
        p.id asc
      limit $2
      `,
      [salesDay, normalizedLimit]
    );
    return result.rows.map(toCandidate);
  }

  async stageProspectCandidates(input: StageProspectCandidatesWrite): Promise<{ run: ProspectSourcingRunRecord; candidates: ProspectSourceCandidateRecord[] }> {
    return stageProspectCandidatesInDb(this.pool, input);
  }

  async reviewProspectCandidates(input: ReviewProspectCandidatesInput): Promise<ReviewProspectCandidatesResult> {
    return reviewProspectCandidatesInDb(this.pool, input);
  }

  async findProspectSourceCandidateById(candidateId: number): Promise<ProspectSourceCandidateRecord | null> {
    return findProspectSourceCandidateByIdInDb(this.pool, candidateId);
  }

  async promoteProspectCandidate(input: Parameters<typeof promoteProspectCandidateInDb>[1]) {
    return promoteProspectCandidateInDb(this.pool, input);
  }
}
