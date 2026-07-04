import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schedulerPath = "../../schedules/prospect-weekly-research-jobs.json";
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
      scope: { outbound_sent: boolean };
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
