import {
  generateTenantId,
  allocatePort,
  generateBearerToken,
  hashToken,
  createInstance,
  updateInstanceStatus,
} from "@/lib/instance";

// Mock bcryptjs
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2b$10$hashedtoken"),
}));

// Mock database with chainable methods
const mockSelectFromWhere = jest.fn().mockResolvedValue([]);
const mockInsertReturning = jest.fn().mockResolvedValue([{ id: "inst_1", userId: "user_123", tenantId: "a1b2c3d4e5f6", status: "queued" }]);
const mockUpdateSetWhere = jest.fn().mockResolvedValue(undefined);

const mockFrom = jest.fn().mockImplementation(() => {
  const result = mockSelectFromWhere();
  // Support both .from() direct (no where) and .from().where() chains
  const obj = Object.assign(Promise.resolve(result), {
    where: mockSelectFromWhere,
    then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  });
  return obj;
});

jest.mock("@/db", () => ({
  db: {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: mockInsertReturning,
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn().mockResolvedValue([{ id: "inst_1" }]),
        })),
      })),
    })),
    select: jest.fn(() => ({
      from: mockFrom,
    })),
  },
}));

jest.mock("@/db/schema", () => ({
  instance: {
    id: "id",
    userId: "userId",
    tenantId: "tenantId",
    gatewayPort: "gatewayPort",
    status: "status",
  },
  fleetEvent: {},
}));

describe("Instance Management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateTenantId()", () => {
    it("returns first 12 chars of userId", () => {
      const tenantId = generateTenantId("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(tenantId).toBe("a1b2c3d4e5f6");
    });

    it("is deterministic", () => {
      const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      expect(generateTenantId(id)).toBe(generateTenantId(id));
    });

    it("produces URL-safe output (lowercase alphanumeric)", () => {
      const tenantId = generateTenantId("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
      expect(tenantId).toMatch(/^[a-z0-9]+$/);
    });

    it("strips hyphens from UUID", () => {
      const tenantId = generateTenantId("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(tenantId).not.toContain("-");
    });
  });

  describe("allocatePort()", () => {
    it("returns 4000 when no ports are allocated", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([]);
      const port = await allocatePort();
      expect(port).toBe(4000);
    });

    it("skips already-allocated ports", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([
        { gatewayPort: 4000 },
        { gatewayPort: 4001 },
      ]);
      const port = await allocatePort();
      expect(port).toBe(4002);
    });

    it("throws when all ports exhausted", async () => {
      const allPorts = Array.from({ length: 1000 }, (_, i) => ({
        gatewayPort: 4000 + i,
      }));
      mockSelectFromWhere.mockResolvedValueOnce(allPorts);
      await expect(allocatePort()).rejects.toThrow("No available ports");
    });
  });

  describe("generateBearerToken()", () => {
    it("returns a 64-char hex string", () => {
      const token = generateBearerToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it("generates different tokens on successive calls", () => {
      const t1 = generateBearerToken();
      const t2 = generateBearerToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe("hashToken()", () => {
    it("returns a bcrypt hash", async () => {
      const hash = await hashToken("mytoken");
      expect(hash).toMatch(/^\$2b\$/);
    });
  });

  describe("createInstance()", () => {
    it("creates an instance record with status queued", async () => {
      mockSelectFromWhere
        .mockResolvedValueOnce([])  // no existing instance
        .mockResolvedValueOnce([]); // no allocated ports (allocatePort query uses different mock chain)

      const result = await createInstance("user_123", "starter");

      expect(result.instance.tenantId).toBeTruthy();
      expect(result.plaintextToken).toHaveLength(64);
      const { db } = jest.requireMock("@/db");
      expect(db.insert).toHaveBeenCalled();
    });

    it("returns existing instance if already created (idempotent)", async () => {
      const existing = {
        id: "inst_1",
        userId: "user_123",
        tenantId: "a1b2c3d4e5f6",
        status: "queued",
      };
      mockSelectFromWhere.mockResolvedValueOnce([existing]);

      const result = await createInstance("user_123", "starter");
      expect(result.instance).toEqual(existing);
    });
  });

  describe("updateInstanceStatus()", () => {
    it("updates instance status and logs fleet event", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([{ id: "inst_1" }]); // find instance for fleet event

      await updateInstanceStatus("a1b2c3d4e5f6", "running");

      const { db } = jest.requireMock("@/db");
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled(); // fleet event
    });
  });
});
