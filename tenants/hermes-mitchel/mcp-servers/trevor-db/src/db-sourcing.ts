import type pg from "pg";
import type {
  PromoteProspectCandidateResult,
  PromoteProspectCandidateWrite,
  ProspectSourceCandidateRecord,
  ProspectSourcingRunRecord,
  ReviewProspectCandidatesInput,
  ReviewProspectCandidatesResult,
  StageProspectCandidatesWrite
} from "./types.js";

const PROSPECT_CANDIDATE_COLUMNS = `
  id,
  sourcing_run_id,
  business_name,
  company,
  area,
  phone,
  email,
  website,
  source_url,
  enrichment_url,
  rating,
  review_count,
  buyer_type,
  lead_source,
  enrichment_source,
  quality_score,
  review_status,
  dedupe_status,
  dedupe_reason,
  review_notes,
  approved_by,
  approved_at,
  promoted_prospect_id,
  created_at,
  updated_at
`;

function jsonWarnings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toSourcingRun(row: Record<string, unknown>): ProspectSourcingRunRecord {
  return {
    id: Number(row.id),
    source: row.source as ProspectSourcingRunRecord["source"],
    enrichmentSource: row.enrichment_source as ProspectSourcingRunRecord["enrichmentSource"],
    area: row.area as string,
    keyword: row.keyword as string | null,
    status: row.status as ProspectSourcingRunRecord["status"],
    requestedBy: row.requested_by as string | null,
    candidateCount: Number(row.candidate_count ?? 0),
    recommendedCount: Number(row.recommended_count ?? 0),
    warnings: jsonWarnings(row.warnings),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  };
}

function toProspectSourceCandidate(row: Record<string, unknown>): ProspectSourceCandidateRecord {
  return {
    id: Number(row.id),
    sourcingRunId: Number(row.sourcing_run_id),
    businessName: row.business_name as string,
    company: row.company as string | null,
    area: row.area as string,
    phone: row.phone as string | null,
    email: row.email as string | null,
    website: row.website as string | null,
    sourceUrl: row.source_url as string | null,
    enrichmentUrl: row.enrichment_url as string | null,
    rating: row.rating !== undefined && row.rating !== null ? Number(row.rating) : null,
    reviewCount: row.review_count !== undefined && row.review_count !== null ? Number(row.review_count) : null,
    buyerType: row.buyer_type as ProspectSourceCandidateRecord["buyerType"],
    leadSource: row.lead_source as ProspectSourceCandidateRecord["leadSource"],
    enrichmentSource: row.enrichment_source as ProspectSourceCandidateRecord["enrichmentSource"],
    qualityScore: Number(row.quality_score ?? 0),
    reviewStatus: row.review_status as ProspectSourceCandidateRecord["reviewStatus"],
    dedupeStatus: row.dedupe_status as ProspectSourceCandidateRecord["dedupeStatus"],
    dedupeReason: row.dedupe_reason as string | null,
    reviewNotes: row.review_notes as string | null,
    approvedBy: row.approved_by as string | null,
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
    promotedProspectId: row.promoted_prospect_id !== undefined && row.promoted_prospect_id !== null ? Number(row.promoted_prospect_id) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  };
}

export async function stageProspectCandidatesInDb(
  pool: pg.Pool,
  input: StageProspectCandidatesWrite
): Promise<{ run: ProspectSourcingRunRecord; candidates: ProspectSourceCandidateRecord[] }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const runResult = await client.query(
      `
      insert into trevor.prospect_sourcing_runs (
        source, enrichment_source, area, keyword, status, requested_by,
        candidate_count, recommended_count, warnings
      )
      values ($1, $2, $3, $4, 'staged', $5, $6, $7, $8::jsonb)
      returning *
      `,
      [
        input.source,
        input.enrichmentSource,
        input.area,
        input.keyword,
        input.requestedBy,
        input.candidates.length,
        input.candidates.filter((candidate) => candidate.reviewStatus === "recommended").length,
        JSON.stringify(input.warnings)
      ]
    );
    const run = toSourcingRun(runResult.rows[0]);
    const candidates: ProspectSourceCandidateRecord[] = [];
    for (const candidate of input.candidates) {
      const inserted = await client.query(
        `
        insert into trevor.prospect_candidates (
          sourcing_run_id, business_name, company, area, phone, email, website,
          source_url, enrichment_url, rating, review_count, buyer_type,
          lead_source, enrichment_source, quality_score, review_status,
          dedupe_status, dedupe_reason, review_notes
        )
        values (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19
        )
        returning ${PROSPECT_CANDIDATE_COLUMNS}
        `,
        [
          run.id,
          candidate.businessName,
          candidate.company,
          candidate.area,
          candidate.phone,
          candidate.email,
          candidate.website,
          candidate.sourceUrl,
          candidate.enrichmentUrl,
          candidate.rating,
          candidate.reviewCount,
          candidate.buyerType,
          candidate.leadSource,
          candidate.enrichmentSource,
          candidate.qualityScore,
          candidate.reviewStatus,
          candidate.dedupeStatus,
          candidate.dedupeReason,
          candidate.reviewNotes
        ]
      );
      candidates.push(toProspectSourceCandidate(inserted.rows[0]));
    }
    await client.query("commit");
    return { run, candidates };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function reviewProspectCandidatesInDb(
  pool: pg.Pool,
  input: ReviewProspectCandidatesInput
): Promise<ReviewProspectCandidatesResult> {
  const normalizedLimit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 15)));
  const params: unknown[] = [normalizedLimit];
  const filters: string[] = [];
  if (input.sourcingRunId !== undefined) {
    params.push(input.sourcingRunId);
    filters.push(`sourcing_run_id = $${params.length}`);
  }
  if (input.status !== undefined) {
    params.push(input.status);
    filters.push(`review_status = $${params.length}`);
  }
  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const result = await pool.query(
    `
    select ${PROSPECT_CANDIDATE_COLUMNS}
    from trevor.prospect_candidates
    ${where}
    order by
      case review_status
        when 'recommended' then 1
        when 'needs_review' then 2
        when 'duplicate' then 3
        when 'rejected' then 4
        when 'approved' then 5
        else 6
      end,
      quality_score desc,
      id asc
    limit $1
    `,
    params
  );

  const countParams: unknown[] = [];
  const countFilters: string[] = [];
  if (input.sourcingRunId !== undefined) {
    countParams.push(input.sourcingRunId);
    countFilters.push(`sourcing_run_id = $${countParams.length}`);
  }
  const countWhere = countFilters.length ? `where ${countFilters.join(" and ")}` : "";
  const counts = await pool.query(
    `
    select review_status, count(*)::int as count
    from trevor.prospect_candidates
    ${countWhere}
    group by review_status
    `,
    countParams
  );
  const countFor = (status: string) => Number(counts.rows.find((row) => row.review_status === status)?.count ?? 0);
  return {
    status: "ok",
    items: result.rows.map(toProspectSourceCandidate),
    counts: {
      recommended: countFor("recommended"),
      needsReview: countFor("needs_review"),
      duplicate: countFor("duplicate"),
      rejected: countFor("rejected"),
      approved: countFor("approved")
    },
    warnings: [],
    outboundSent: false
  };
}

export async function findProspectSourceCandidateByIdInDb(
  pool: pg.Pool,
  candidateId: number
): Promise<ProspectSourceCandidateRecord | null> {
  const result = await pool.query(
    `
    select ${PROSPECT_CANDIDATE_COLUMNS}
    from trevor.prospect_candidates
    where id = $1
    limit 1
    `,
    [candidateId]
  );
  return result.rows[0] ? toProspectSourceCandidate(result.rows[0]) : null;
}

export async function promoteProspectCandidateInDb(
  pool: pg.Pool,
  input: PromoteProspectCandidateWrite
): Promise<PromoteProspectCandidateResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const found = await client.query(
      `
      select ${PROSPECT_CANDIDATE_COLUMNS}
      from trevor.prospect_candidates
      where id = $1
      for update
      `,
      [input.candidateId]
    );
    const candidate = found.rows[0] ? toProspectSourceCandidate(found.rows[0]) : null;
    if (!candidate) {
      await client.query("commit");
      return { status: "not_found", candidateId: input.candidateId, prospectId: null, callTaskId: null, warnings: ["candidate not found."], outboundSent: false };
    }
    if (candidate.reviewStatus === "duplicate" || candidate.dedupeStatus === "duplicate") {
      await client.query("commit");
      return { status: "duplicate", candidateId: input.candidateId, prospectId: null, callTaskId: null, warnings: [candidate.dedupeReason ?? "candidate is duplicate."], outboundSent: false };
    }
    if (candidate.reviewStatus === "rejected") {
      await client.query("commit");
      return { status: "rejected", candidateId: input.candidateId, prospectId: null, callTaskId: null, warnings: [candidate.dedupeReason ?? "candidate is rejected."], outboundSent: false };
    }

    let prospectId = candidate.promotedProspectId;
    if (!prospectId) {
      const existing = await client.query(
        `
        select id
        from trevor.prospects
        where lower(coalesce(company, name, '')) = lower($1)
           or ($2::text is not null and nullif(trim(phone), '') = $2)
        order by updated_at desc nulls last, id asc
        limit 1
        `,
        [candidate.company ?? candidate.businessName, candidate.phone]
      );
      prospectId = existing.rows[0]?.id ? Number(existing.rows[0].id) : null;
    }

    if (!prospectId) {
      const notes = [
        `Sourced via ${candidate.leadSource}.`,
        candidate.enrichmentSource ? `Enriched via ${candidate.enrichmentSource}.` : null,
        candidate.website ? `Website: ${candidate.website}` : null,
        candidate.reviewNotes
      ].filter(Boolean).join(" ");
      const inserted = await client.query(
        `
        insert into trevor.prospects (
          name, company, email, phone, buyer_type, status, notes,
          lead_source, preferred_channel, next_action_type, priority
        )
        values ($1, $2, $3, $4, 'retail_jeweler', 'active', $5, $6, 'phone', 'initial_outreach', 1)
        returning id
        `,
        [
          candidate.businessName,
          candidate.company,
          candidate.email,
          candidate.phone,
          notes,
          candidate.leadSource
        ]
      );
      prospectId = Number(inserted.rows[0].id);
    }

    const updatedCandidate = await client.query(
      `
      update trevor.prospect_candidates
      set review_status = 'approved',
          approved_by = $2,
          approved_at = coalesce(approved_at, now()),
          promoted_prospect_id = $3,
          review_notes = coalesce($4, review_notes),
          updated_at = now()
      where id = $1
      returning ${PROSPECT_CANDIDATE_COLUMNS}
      `,
      [input.candidateId, input.approvedBy, prospectId, input.approvalNote]
    );

    let callTaskId: number | null = null;
    if (input.createCallTask) {
      const existingTask = await client.query(
        `
        select id
        from trevor.call_tasks
        where prospect_id = $1
          and task_type = 'call'
          and status = 'open'
        order by due_at asc nulls last, id asc
        limit 1
        `,
        [prospectId]
      );
      if (existingTask.rows[0]?.id) {
        callTaskId = Number(existingTask.rows[0].id);
      } else {
        const created = await client.query(
          `
          insert into trevor.call_tasks (prospect_id, task_type, priority, reason, call_objective, status, due_at)
          values ($1, 'call', 1, $2, 'Initial outreach to qualify buying interest.', 'open', now())
          returning id
          `,
          [prospectId, `New sourced prospect from ${candidate.leadSource}.`]
        );
        callTaskId = Number(created.rows[0].id);
      }
    }

    await client.query("commit");
    const approvedCandidate = toProspectSourceCandidate(updatedCandidate.rows[0]);
    return {
      status: "promoted",
      candidateId: approvedCandidate.id,
      prospectId,
      callTaskId,
      warnings: [],
      outboundSent: false
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
