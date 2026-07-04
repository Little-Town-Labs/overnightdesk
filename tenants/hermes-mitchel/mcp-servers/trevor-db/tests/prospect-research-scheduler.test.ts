import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schedulerPath = "../../schedules/prospect-weekly-research-jobs.json";
const hermesInstallPlanPath = "../../schedules/prospect-weekly-hermes-install-plan.json";
const centralGateScriptPath = "../../scripts/prospect-weekly-central-gate.sh";
const runbookPath = "../../runbooks/prospect-deep-research.md";

test("prospect weekly scheduler template is disabled and pinned to Saturday night Central time", () => {
  const template = JSON.parse(readFileSync(schedulerPath, "utf8")) as {
    install_status: string;
    approval_required: boolean;
    timezone: string;
    schedule_local: string;
    jobs: Array<{
      id: string;
      enabled: boolean;
      schedule: { kind: string; day_of_week: string; time: string; timezone: string };
      scope: { outbound_sent: boolean; subagents?: string[] };
      required_tools: string[];
    }>;
  };

  assert.equal(template.install_status, "template_only");
  assert.equal(template.approval_required, true);
  assert.equal(template.timezone, "America/Chicago");
  assert.equal(template.schedule_local, "Saturday 23:00 America/Chicago");
  assert.equal(template.jobs.length, 2);

  const jobIds = template.jobs.map((job) => job.id).sort();
  assert.deepEqual(jobIds, [
    "trevor-missing-email-enrichment-weekly",
    "trevor-prospect-deep-research-weekly"
  ]);

  for (const job of template.jobs) {
    assert.equal(job.enabled, false, `${job.id} must be disabled by default`);
    assert.equal(job.schedule.kind, "weekly_local");
    assert.equal(job.schedule.day_of_week, "saturday");
    assert.equal(job.schedule.time, "23:00");
    assert.equal(job.schedule.timezone, "America/Chicago");
    assert.equal(job.scope.outbound_sent, false);
    assert.ok(job.required_tools.length > 0, `${job.id} must declare required MCP tools`);
  }

  const researchJob = template.jobs.find((job) => job.id === "trevor-prospect-deep-research-weekly");
  assert.ok(researchJob, "missing deep research job");
  assert.ok(researchJob.required_tools.includes("delegate_task"));
  assert.deepEqual(researchJob.scope.subagents, [
    "source-finder",
    "rdap-domain-verifier",
    "evidence-quality-reviewer"
  ]);
});

test("prospect deep research runbook documents scheduler operations", () => {
  const runbook = readFileSync(runbookPath, "utf8");

  for (const phrase of [
    "Weekly Scheduler",
    "Saturday at 23:00 America/Chicago",
    "Validation",
    "Enable",
    "Disable",
    "Rollback",
    "Owner",
    "Log location",
    "Side-effect checks",
    "explicit operator approval"
  ]) {
    assert.ok(runbook.includes(phrase), `missing ${phrase}`);
  }
});

test("Hermes install plan stays disabled and uses Central-time wake gate", () => {
  const plan = JSON.parse(readFileSync(hermesInstallPlanPath, "utf8")) as {
    install_status: string;
    approval_required: boolean;
    timezone_strategy: {
      requested_local_time: string;
      hermes_host_timezone: string;
      cron_expression: string;
      wake_gate_script: string;
    };
    jobs: Array<{
      id: string;
      enabled: boolean;
      state: string;
      script: string;
      no_agent: boolean;
      prompt: string;
      schedule: { kind: string; expr: string; display: string };
    }>;
  };

  assert.equal(plan.install_status, "disabled_install_plan");
  assert.equal(plan.approval_required, true);
  assert.equal(plan.timezone_strategy.requested_local_time, "Saturday 23:00 America/Chicago");
  assert.equal(plan.timezone_strategy.hermes_host_timezone, "UTC");
  assert.equal(plan.timezone_strategy.cron_expression, "0 4,5 * * 0");
  assert.equal(plan.timezone_strategy.wake_gate_script, "prospect-weekly-central-gate.sh");
  assert.equal(plan.jobs.length, 2);

  for (const job of plan.jobs) {
    assert.equal(job.enabled, false, `${job.id} must not enable production cron`);
    assert.equal(job.state, "paused");
    assert.equal(job.script, "prospect-weekly-central-gate.sh");
    assert.equal(job.no_agent, false);
    assert.equal(job.schedule.kind, "cron");
    assert.equal(job.schedule.expr, "0 4,5 * * 0");
    assert.match(job.schedule.display, /America\/Chicago/);
    assert.match(job.prompt, /Do not|Never/i);
  }

  const enrichmentJob = plan.jobs.find((job) => job.id === "trevor-missing-email-enrichment-weekly");
  assert.ok(enrichmentJob, "missing enrichment job");
  assert.match(enrichmentJob.prompt, /newly queued, retryable error, or stale claimed/i);
  assert.match(enrichmentJob.prompt, /do not reset completed no_email_found or needs_review/i);

  const researchJob = plan.jobs.find((job) => job.id === "trevor-prospect-deep-research-weekly");
  assert.ok(researchJob, "missing deep research job");
  assert.match(researchJob.prompt, /delegate_task/);
  assert.match(researchJob.prompt, /source-finder/);
  assert.match(researchJob.prompt, /rdap-domain-verifier/);
  assert.match(researchJob.prompt, /evidence-quality-reviewer/);
  assert.match(researchJob.prompt, /toolsets=.*web/i);
  assert.match(researchJob.prompt, /Do not ask child agents to call store_prospect_research_evidence/i);
  assert.match(researchJob.prompt, /After children return, the parent job/i);
});

test("Central-time wake gate emits wakeAgent JSON", () => {
  const script = readFileSync(centralGateScriptPath, "utf8");

  assert.match(script, /TZ=America\/Chicago/);
  assert.match(script, /local_dow/);
  assert.match(script, /local_hour/);
  assert.match(script, /"wakeAgent": true/);
  assert.match(script, /"wakeAgent": false/);
});
