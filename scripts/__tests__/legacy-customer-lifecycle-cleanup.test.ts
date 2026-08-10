import {
  executeLegacyCustomerLifecycleCleanup,
  type LegacyCustomerLifecycleCleanupCounts,
  type LegacyCustomerLifecycleCleanupPlan,
  type LegacyCustomerLifecycleCleanupStore,
} from "../legacy-customer-lifecycle-cleanup";

const APPLY_APPROVAL_ENV = "LEGACY_CLEANUP_APPLY_APPROVAL_TOKEN";
const ROLLBACK_APPROVAL_ENV = "LEGACY_CLEANUP_ROLLBACK_APPROVAL_TOKEN";
const APPLY_APPROVAL = "test-only-apply-approval";
const ROLLBACK_APPROVAL = "test-only-rollback-approval";

const beforeCounts: LegacyCustomerLifecycleCleanupCounts = {
  providerObligationCount: 0,
  localSubscriptionRowCount: 0,
  meaningfulWizardStateCount: 0,
  activeSchemaConsumerCount: 0,
  subscriptionTableCount: 1,
  wizardStateColumnCount: 1,
  activeUserCount: 1,
  activeMembershipCount: 1,
  activeInstanceCount: 1,
  activeConversationCount: 2,
  activeBusinessRecordCount: 3,
};

class InMemoryCleanupStore implements LegacyCustomerLifecycleCleanupStore {
  counts: LegacyCustomerLifecycleCleanupCounts;
  applyCalls = 0;
  rollbackCalls = 0;

  constructor(initialCounts: LegacyCustomerLifecycleCleanupCounts = beforeCounts) {
    this.counts = { ...initialCounts };
  }

  async inspect(): Promise<LegacyCustomerLifecycleCleanupCounts> {
    return { ...this.counts };
  }

  async apply(plan: LegacyCustomerLifecycleCleanupPlan): Promise<void> {
    this.applyCalls += 1;
    expect(plan.status).toBe("ready");
    this.counts = {
      ...this.counts,
      subscriptionTableCount: 0,
      wizardStateColumnCount: 0,
    };
  }

  async rollback(plan: LegacyCustomerLifecycleCleanupPlan): Promise<void> {
    this.rollbackCalls += 1;
    expect(plan.status).toBe("ready");
    this.counts = { ...plan.beforeCounts };
  }
}

function withApprovalTokens<T>(callback: () => Promise<T>): Promise<T> {
  const previousApply = process.env[APPLY_APPROVAL_ENV];
  const previousRollback = process.env[ROLLBACK_APPROVAL_ENV];

  process.env[APPLY_APPROVAL_ENV] = APPLY_APPROVAL;
  process.env[ROLLBACK_APPROVAL_ENV] = ROLLBACK_APPROVAL;

  return callback().finally(() => {
    if (previousApply === undefined) delete process.env[APPLY_APPROVAL_ENV];
    else process.env[APPLY_APPROVAL_ENV] = previousApply;

    if (previousRollback === undefined) delete process.env[ROLLBACK_APPROVAL_ENV];
    else process.env[ROLLBACK_APPROVAL_ENV] = previousRollback;
  });
}

describe("legacy customer lifecycle cleanup", () => {
  it("plans a value-free ready operation when every retirement gate is clear", async () => {
    const store = new InMemoryCleanupStore();

    const plan = await executeLegacyCustomerLifecycleCleanup({
      command: "plan",
      store,
    });

    expect(plan.status).toBe("ready");
    expect(plan.beforeCounts).toEqual(beforeCounts);
    expect(plan.afterCounts).toMatchObject({
      providerObligationCount: 0,
      localSubscriptionRowCount: 0,
      meaningfulWizardStateCount: 0,
      activeSchemaConsumerCount: 0,
      subscriptionTableCount: 0,
      wizardStateColumnCount: 0,
    });
    expect(JSON.stringify(plan)).not.toContain("stripe_customer");
    expect(JSON.stringify(plan)).not.toContain("subscription_secret");
    expect(store.applyCalls).toBe(0);
    expect(store.rollbackCalls).toBe(0);
  });

  it.each([
    [
      "provider obligations",
      { providerObligationCount: 1 },
      "provider obligations",
    ],
    [
      "local subscription rows",
      { localSubscriptionRowCount: 1 },
      "local subscription rows",
    ],
    [
      "meaningful wizard state",
      { meaningfulWizardStateCount: 1 },
      "meaningful wizard state",
    ],
    [
      "active schema consumers",
      { activeSchemaConsumerCount: 1 },
      "active schema consumers",
    ],
    [
      "ambiguous provider obligations",
      { providerObligationCount: null },
      "provider obligations",
    ],
    [
      "ambiguous schema consumers",
      { activeSchemaConsumerCount: null },
      "schema consumers",
    ],
  ])(
    "stops without mutation when %s is non-zero or ambiguous",
    async (_label, override, reason) => {
      const store = new InMemoryCleanupStore({ ...beforeCounts, ...override });

      const plan = await executeLegacyCustomerLifecycleCleanup({
        command: "plan",
        store,
      });

      expect(plan.status).toBe("stopped");
      expect(plan.stopReasons).toEqual(expect.arrayContaining([reason]));
      expect(store.applyCalls).toBe(0);

      await withApprovalTokens(async () => {
        await expect(
          executeLegacyCustomerLifecycleCleanup({
            command: "apply",
            store,
            approvalToken: APPLY_APPROVAL,
          }),
        ).rejects.toThrow(/stop|blocked|not ready/i);
      });

      expect(store.applyCalls).toBe(0);
      await expect(store.inspect()).resolves.toEqual({
        ...beforeCounts,
        ...override,
      });
    },
  );

  it("requires a distinct explicit apply approval token before mutation", async () => {
    const store = new InMemoryCleanupStore();

    await withApprovalTokens(async () => {
      await expect(
        executeLegacyCustomerLifecycleCleanup({
          command: "apply",
          store,
        }),
      ).rejects.toThrow(/approval token/i);

      await expect(
        executeLegacyCustomerLifecycleCleanup({
          command: "apply",
          store,
          approvalToken: "wrong-token",
        }),
      ).rejects.toThrow(/approval token/i);
    });

    expect(store.applyCalls).toBe(0);
    await expect(store.inspect()).resolves.toEqual(beforeCounts);
  });

  it("applies only the retired schema objects and verifies before/after counts", async () => {
    const store = new InMemoryCleanupStore();

    await withApprovalTokens(async () => {
      const applied = await executeLegacyCustomerLifecycleCleanup({
        command: "apply",
        store,
        approvalToken: APPLY_APPROVAL,
      });

      expect(applied.status).toBe("applied");
      expect(applied.beforeCounts).toEqual(beforeCounts);
      expect(applied.afterCounts).toMatchObject({
        subscriptionTableCount: 0,
        wizardStateColumnCount: 0,
      });
      expect(applied.afterCounts).toMatchObject({
        activeUserCount: beforeCounts.activeUserCount,
        activeMembershipCount: beforeCounts.activeMembershipCount,
        activeInstanceCount: beforeCounts.activeInstanceCount,
        activeConversationCount: beforeCounts.activeConversationCount,
        activeBusinessRecordCount: beforeCounts.activeBusinessRecordCount,
      });

      const verified = await executeLegacyCustomerLifecycleCleanup({
        command: "verify",
        store,
        plan: applied.plan,
      });

      expect(verified.status).toBe("verified");
      expect(verified.afterCounts).toEqual(applied.afterCounts);
    });

    expect(store.applyCalls).toBe(1);
    expect(store.rollbackCalls).toBe(0);
  });

  it("refuses verification before apply and refuses rollback without its own approval", async () => {
    const store = new InMemoryCleanupStore();
    const plan = await executeLegacyCustomerLifecycleCleanup({
      command: "plan",
      store,
    });

    await expect(
      executeLegacyCustomerLifecycleCleanup({
        command: "verify",
        store,
        plan,
      }),
    ).rejects.toThrow(/not verified|not applied/i);

    await withApprovalTokens(async () => {
      await executeLegacyCustomerLifecycleCleanup({
        command: "apply",
        store,
        approvalToken: APPLY_APPROVAL,
      });

      await expect(
        executeLegacyCustomerLifecycleCleanup({
          command: "rollback",
          store,
          plan,
        }),
      ).rejects.toThrow(/approval token/i);

      await expect(
        executeLegacyCustomerLifecycleCleanup({
          command: "rollback",
          store,
          plan,
          approvalToken: APPLY_APPROVAL,
        }),
      ).rejects.toThrow(/approval token/i);
    });

    expect(store.rollbackCalls).toBe(0);
  });

  it("restores every before-count on rollback without changing active data", async () => {
    const store = new InMemoryCleanupStore();

    await withApprovalTokens(async () => {
      const applied = await executeLegacyCustomerLifecycleCleanup({
        command: "apply",
        store,
        approvalToken: APPLY_APPROVAL,
      });

      const rolledBack = await executeLegacyCustomerLifecycleCleanup({
        command: "rollback",
        store,
        plan: applied.plan,
        approvalToken: ROLLBACK_APPROVAL,
      });

      expect(rolledBack.status).toBe("rolled_back");
      expect(rolledBack.afterCounts).toEqual(beforeCounts);
      expect(rolledBack.afterCounts).toEqual(rolledBack.plan.beforeCounts);
      expect(rolledBack.afterCounts).toMatchObject({
        activeUserCount: beforeCounts.activeUserCount,
        activeMembershipCount: beforeCounts.activeMembershipCount,
        activeInstanceCount: beforeCounts.activeInstanceCount,
        activeConversationCount: beforeCounts.activeConversationCount,
        activeBusinessRecordCount: beforeCounts.activeBusinessRecordCount,
      });
    });

    expect(store.applyCalls).toBe(1);
    expect(store.rollbackCalls).toBe(1);
    await expect(store.inspect()).resolves.toEqual(beforeCounts);
  });
});
