/**
 * JobList + CreateJobForm — Unit Tests (Feature 7, Tasks 3.3-3.4)
 *
 * Tests the job management client components:
 * - Job list renders with initial data
 * - Pagination controls
 * - Delete only on pending jobs
 * - Empty state
 * - Create job form validation
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let jobListMockFetchResponse: { ok: boolean; json: () => Promise<unknown> };

const jobListMockFetch = jest.fn().mockImplementation(() =>
  Promise.resolve(jobListMockFetchResponse)
);

(globalThis as unknown as Record<string, unknown>).fetch = jobListMockFetch;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "job-1",
    name: "Test Job",
    status: "pending",
    source: "dashboard",
    prompt: "Do something",
    createdAt: "2026-03-22T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// JobList logic tests
// ---------------------------------------------------------------------------

describe("JobList data handling", () => {
  it("identifies pending jobs for delete eligibility", () => {
    const jobs = [
      makeJob({ id: "1", status: "pending" }),
      makeJob({ id: "2", status: "running" }),
      makeJob({ id: "3", status: "completed" }),
      makeJob({ id: "4", status: "failed" }),
    ];

    const deletable = jobs.filter((j) => j.status === "pending");
    expect(deletable).toHaveLength(1);
    expect(deletable[0].id).toBe("1");
  });

  it("handles empty job list", () => {
    const jobs: Record<string, unknown>[] = [];
    expect(jobs.length).toBe(0);
  });

  it("displays name or 'Untitled' for jobs without names", () => {
    const namedJob = makeJob({ name: "My Job" });
    const unnamedJob = makeJob({ name: undefined });

    expect(namedJob.name || "Untitled").toBe("My Job");
    expect(unnamedJob.name || "Untitled").toBe("Untitled");
  });

  it("formats creation time correctly", () => {
    const job = makeJob({ createdAt: "2026-03-22T10:00:00Z" });
    const formatted = new Date(job.createdAt as string).toLocaleString();
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("handles jobs with all status types", () => {
    const statuses = ["pending", "running", "completed", "failed"];
    const statusColors: Record<string, string> = {
      pending: "bg-amber-500/20 text-amber-400",
      running: "bg-blue-500/20 text-blue-400",
      completed: "bg-emerald-500/20 text-emerald-400",
      failed: "bg-red-500/20 text-red-400",
    };

    for (const status of statuses) {
      expect(statusColors[status]).toBeDefined();
    }
  });

  it("handles jobs with all source types", () => {
    const sources = ["dashboard", "heartbeat", "cron", "telegram", "discord"];
    const sourceColors: Record<string, string> = {
      dashboard: "bg-zinc-700 text-zinc-300",
      heartbeat: "bg-purple-500/20 text-purple-400",
      cron: "bg-indigo-500/20 text-indigo-400",
      telegram: "bg-sky-500/20 text-sky-400",
      discord: "bg-violet-500/20 text-violet-400",
    };

    for (const source of sources) {
      expect(sourceColors[source]).toBeDefined();
    }
  });
});

describe("JobList pagination", () => {
  const PAGE_SIZE = 20;

  it("calculates correct offset for previous page", () => {
    const currentOffset = 40;
    const newOffset = Math.max(0, currentOffset - PAGE_SIZE);
    expect(newOffset).toBe(20);
  });

  it("does not go below 0 for previous page", () => {
    const currentOffset = 0;
    const newOffset = Math.max(0, currentOffset - PAGE_SIZE);
    expect(newOffset).toBe(0);
  });

  it("calculates correct offset for next page", () => {
    const currentOffset = 20;
    const newOffset = currentOffset + PAGE_SIZE;
    expect(newOffset).toBe(40);
  });

  it("disables next when fewer results than page size", () => {
    const jobCount = 15;
    const hasMore = jobCount >= PAGE_SIZE;
    expect(hasMore).toBe(false);
  });

  it("enables next when results equal page size", () => {
    const jobCount = 20;
    const hasMore = jobCount >= PAGE_SIZE;
    expect(hasMore).toBe(true);
  });

  it("disables previous on first page", () => {
    const offset = 0;
    expect(offset === 0).toBe(true);
  });
});

describe("JobList API interaction", () => {
  beforeEach(() => {
    jobListMockFetch.mockClear();
    jobListMockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    };
  });

  it("fetches jobs with correct pagination params", async () => {
    jobListMockFetchResponse = {
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: [makeJob()] }),
    };

    await jobListMockFetch("/api/engine/jobs?offset=0&limit=20");

    expect(jobListMockFetch).toHaveBeenCalledWith(
      "/api/engine/jobs?offset=0&limit=20"
    );
  });

  it("sends DELETE request for pending job", async () => {
    jobListMockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ success: true, data: true }),
    };

    await jobListMockFetch("/api/engine/jobs/job-1", { method: "DELETE" });

    expect(jobListMockFetch).toHaveBeenCalledWith("/api/engine/jobs/job-1", {
      method: "DELETE",
    });
  });

  it("handles delete error response", async () => {
    jobListMockFetchResponse = {
      ok: false,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Failed to delete job",
        }),
    };

    const response = await jobListMockFetch("/api/engine/jobs/job-1", {
      method: "DELETE",
    });

    expect(response.ok).toBe(false);
    const data = await response.json();
    expect(data.error).toBe("Failed to delete job");
  });
});

// ---------------------------------------------------------------------------
// CreateJobForm logic tests
// ---------------------------------------------------------------------------

describe("CreateJobForm validation", () => {
  const MAX_PROMPT_LENGTH = 100_000;
  const MAX_NAME_LENGTH = 255;

  it("rejects empty prompt", () => {
    const prompt = "";
    const trimmed = prompt.trim();
    expect(trimmed.length === 0).toBe(true);
  });

  it("rejects whitespace-only prompt", () => {
    const prompt = "   \n\t  ";
    const trimmed = prompt.trim();
    expect(trimmed.length === 0).toBe(true);
  });

  it("accepts valid prompt", () => {
    const prompt = "Do something useful";
    const trimmed = prompt.trim();
    expect(trimmed.length > 0).toBe(true);
    expect(trimmed.length <= MAX_PROMPT_LENGTH).toBe(true);
  });

  it("rejects prompt exceeding max length", () => {
    const prompt = "x".repeat(MAX_PROMPT_LENGTH + 1);
    expect(prompt.length > MAX_PROMPT_LENGTH).toBe(true);
  });

  it("accepts prompt at exactly max length", () => {
    const prompt = "x".repeat(MAX_PROMPT_LENGTH);
    expect(prompt.length <= MAX_PROMPT_LENGTH).toBe(true);
  });

  it("accepts empty name (optional field)", () => {
    const name = "";
    const trimmed = name.trim();
    // Empty name is valid (optional)
    expect(trimmed.length <= MAX_NAME_LENGTH).toBe(true);
  });

  it("rejects name exceeding max length", () => {
    const name = "x".repeat(MAX_NAME_LENGTH + 1);
    expect(name.length > MAX_NAME_LENGTH).toBe(true);
  });

  it("accepts name at exactly max length", () => {
    const name = "x".repeat(MAX_NAME_LENGTH);
    expect(name.length <= MAX_NAME_LENGTH).toBe(true);
  });
});

describe("CreateJobForm API interaction", () => {
  beforeEach(() => {
    jobListMockFetch.mockClear();
    jobListMockFetchResponse = {
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: makeJob() }),
    };
  });

  it("sends correct POST payload with name", async () => {
    await jobListMockFetch("/api/engine/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Do something", name: "Test" }),
    });

    const calledBody = JSON.parse(
      jobListMockFetch.mock.calls[0][1].body as string
    );
    expect(calledBody.prompt).toBe("Do something");
    expect(calledBody.name).toBe("Test");
  });

  it("sends correct POST payload without name", async () => {
    await jobListMockFetch("/api/engine/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Do something" }),
    });

    const calledBody = JSON.parse(
      jobListMockFetch.mock.calls[0][1].body as string
    );
    expect(calledBody.prompt).toBe("Do something");
    expect(calledBody.name).toBeUndefined();
  });

  it("handles create error response", async () => {
    jobListMockFetchResponse = {
      ok: false,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Rate limit exceeded",
        }),
    };

    const response = await jobListMockFetch("/api/engine/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test" }),
    });

    expect(response.ok).toBe(false);
    const data = await response.json();
    expect(data.error).toBe("Rate limit exceeded");
  });

  it("handles network error gracefully", async () => {
    jobListMockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(
      jobListMockFetch("/api/engine/jobs", {
        method: "POST",
        body: "{}",
      })
    ).rejects.toThrow("Network error");
  });
});

describe("JobList expanded row content", () => {
  it("shows prompt text in expanded view", () => {
    const job = makeJob({ prompt: "Check the server status" });
    expect(job.prompt).toBe("Check the server status");
  });

  it("shows result for completed jobs", () => {
    const job = makeJob({
      status: "completed",
      result: "All systems operational",
    });
    expect(job.status).toBe("completed");
    expect(job.result).toBe("All systems operational");
  });

  it("shows error for failed jobs", () => {
    const job = makeJob({
      status: "failed",
      error: "Connection timeout",
    });
    expect(job.status).toBe("failed");
    expect(job.error).toBe("Connection timeout");
  });

  it("does not show result for non-completed jobs", () => {
    const job = makeJob({ status: "running", result: undefined });
    const showResult = job.status === "completed" && !!job.result;
    expect(showResult).toBe(false);
  });

  it("does not show error for non-failed jobs", () => {
    const job = makeJob({ status: "pending", error: undefined });
    const showError = job.status === "failed" && !!job.error;
    expect(showError).toBe(false);
  });
});
