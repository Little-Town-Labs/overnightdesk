import type {
  FollowUpDraftSummary,
  MitchelProspectingSummary,
  ReviewItem,
} from "@/lib/mitchel-prospecting/types";
import { SectionMetric } from "./queue-section";

interface MitchelProspectingWorkspaceProps {
  summary: MitchelProspectingSummary;
}

function ReviewList({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No review-needed prospecting work.</p>;
  }

  return (
    <div className="divide-y divide-zinc-800">
      {items.slice(0, 5).map((item) => (
        <div key={`${item.itemType}-${item.itemId}`} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">{item.title}</p>
              <p className="mt-1 text-xs text-zinc-500">{item.reason}</p>
            </div>
            <span className="shrink-0 rounded bg-zinc-800 px-2 py-1 text-[11px] uppercase text-zinc-400">
              {item.itemType.replace(/_/g, " ")}
            </span>
          </div>
          {item.recommendedNextStep && (
            <p className="mt-2 text-xs text-zinc-400">{item.recommendedNextStep}</p>
          )}
          {item.blockingFlags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.blockingFlags.map((flag) => (
                <span key={flag} className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                  {flag.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DraftList({ drafts }: { drafts: FollowUpDraftSummary[] }) {
  if (drafts.length === 0) {
    return <p className="text-sm text-zinc-500">No follow-up drafts awaiting review.</p>;
  }

  return (
    <div className="divide-y divide-zinc-800">
      {drafts.slice(0, 5).map((draft) => (
        <div key={draft.draftId} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-100">{draft.displayName}</p>
            <span className="rounded bg-zinc-800 px-2 py-1 text-[11px] uppercase text-zinc-400">
              {draft.requiresApproval ? "needs approval" : draft.channel}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{draft.summary ?? "Draft awaiting approval."}</p>
        </div>
      ))}
    </div>
  );
}

export function MitchelProspectingWorkspace({ summary }: MitchelProspectingWorkspaceProps) {
  return (
    <section className="od-card mb-4 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Trevor Prospecting</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Review queue for prospects and candidates not necessarily in Agiled yet.
          </p>
        </div>
        <div className="rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
          outbound sent: <span className="font-semibold text-emerald-300">{String(summary.outboundSent)}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SectionMetric label="Prospects" section={summary.sections.prospects} />
        <SectionMetric label="Candidates" section={summary.sections.stagedCandidates} />
        <SectionMetric label="Call Tasks" section={summary.sections.callTasks} />
        <SectionMetric label="Review" section={summary.sections.reviewItems} />
        <SectionMetric label="Drafts" section={summary.sections.followUpDrafts} />
      </div>

      {summary.warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-sm text-amber-200">{summary.warnings[0]}</p>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">Needs Review</h3>
          <ReviewList items={summary.reviewItems} />
        </div>
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">Follow-Up Drafts</h3>
          <DraftList drafts={summary.followUpDrafts} />
        </div>
      </div>
    </section>
  );
}
