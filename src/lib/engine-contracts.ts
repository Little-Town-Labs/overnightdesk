/**
 * Engine Response Contracts
 *
 * TypeScript interfaces matching the exact JSON shapes returned by the
 * overnightdesk-engine Go daemon. All field names are snake_case to match
 * Go's JSON serialization.
 *
 * These types are the single source of truth for the platform↔engine boundary.
 * Contract tests validate that engine-client.ts correctly parses these shapes.
 */

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface EngineJobResponse {
  id: string;
  conversation_id: string | null;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  source: "dashboard" | "heartbeat" | "cron" | "telegram" | "discord";
  prompt: string;
  result: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface EngineJobListEnvelope {
  jobs: EngineJobResponse[];
  limit: number;
  offset: number;
}

export interface EngineJobCreateResponse {
  id: string;
  status: "pending";
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface EngineConversationResponse {
  id: string;
  channel: string;
  user_id: string;
  thread_id: string | null;
  started_at: string;
  last_activity: string;
  metadata: string;
}

export interface EngineConversationListEnvelope {
  conversations: EngineConversationResponse[];
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface EngineMessageResponse {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface EngineMessageListEnvelope {
  messages: EngineMessageResponse[];
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

export interface EngineHeartbeatResponse {
  enabled: boolean;
  interval_seconds: number;
  last_run: string;
  next_run: string;
  consecutive_failures: number;
  prompt?: string;
}

export interface EngineHeartbeatUpdatePayload {
  enabled?: boolean;
  interval_seconds?: number;
  prompt?: string;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface EngineQueueStatus {
  running: boolean;
  current_job?: string;
  source?: string;
  queue_depth: number;
}

export interface EngineHeartbeatStatus {
  enabled: boolean;
  last_run: string;
  next_run: string;
  consecutive_failures: number;
  interval_seconds: number;
}

export interface EngineStatusResponse {
  version: string;
  uptime: string;
  queue: EngineQueueStatus;
  claude_auth: "connected" | "not_configured";
  database_size_bytes: number;
  heartbeat?: EngineHeartbeatStatus;
}

// ---------------------------------------------------------------------------
// Auth Status
// ---------------------------------------------------------------------------

export interface EngineAuthStatusResponse {
  status: "authenticated" | "not_authenticated" | "unknown";
  message: string;
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

export interface EngineTerminalTicketResponse {
  ticket: string;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export interface EngineLogEnvelope {
  lines: string[];
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

export interface EngineTelegramConfigResponse {
  enabled: boolean;
  allowed_users: string[];
  webhook_url: string;
  status: string;
  status_message: string;
  updated_at: string;
}

export interface EngineTelegramConfigRequest {
  bot_token: string;
  allowed_users: string[];
  enabled: boolean;
  webhook_base_url?: string;
}

// ---------------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------------

export interface EngineDiscordConfigResponse {
  enabled: boolean;
  allowed_users: string[];
  status: string;
  status_message: string;
  updated_at: string;
}

export interface EngineDiscordConfigRequest {
  bot_token: string;
  allowed_users: string[];
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Flight Recorder
// ---------------------------------------------------------------------------

export interface EngineBufferStats {
  capacity: number;
  used_bytes: number;
  total_written: number;
  dropped: number;
  wrapped: boolean;
}

export interface EngineFlightRecorderStatus {
  enabled: boolean;
  buffer_stats: EngineBufferStats;
  snapshot_count: number;
  runtime_trace_enabled: boolean;
}

export interface EngineSnapshotInfo {
  id: string;
  reason: string;
  timestamp: string;
  event_count: number;
  buffer_stats: EngineBufferStats;
  directory: string;
  has_runtime_trace: boolean;
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

export const FIXTURES = {
  job: {
    id: "job-abc-123",
    conversation_id: "conv-xyz-789",
    name: "Daily report",
    status: "completed" as const,
    source: "dashboard" as const,
    prompt: "Generate daily summary",
    result: "Summary: All systems operational",
    started_at: "2026-03-22T10:00:00Z",
    completed_at: "2026-03-22T10:02:30Z",
    created_at: "2026-03-22T09:59:55Z",
  } satisfies EngineJobResponse,

  jobList: {
    jobs: [
      {
        id: "job-1",
        conversation_id: null,
        name: "Check servers",
        status: "completed" as const,
        source: "dashboard" as const,
        prompt: "check servers",
        result: "All OK",
        started_at: "2026-03-22T10:00:00Z",
        completed_at: "2026-03-22T10:01:00Z",
        created_at: "2026-03-22T09:59:00Z",
      },
      {
        id: "job-2",
        conversation_id: null,
        name: "Run diagnostics",
        status: "pending" as const,
        source: "cron" as const,
        prompt: "run diagnostics",
        result: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-03-22T11:00:00Z",
      },
    ],
    limit: 20,
    offset: 0,
  } satisfies EngineJobListEnvelope,

  conversation: {
    id: "conv-1",
    channel: "telegram",
    user_id: "12345",
    thread_id: null,
    started_at: "2026-03-22T08:00:00Z",
    last_activity: "2026-03-22T10:30:00Z",
    metadata: "{}",
  } satisfies EngineConversationResponse,

  conversationList: {
    conversations: [
      {
        id: "conv-1",
        channel: "telegram",
        user_id: "12345",
        thread_id: null,
        started_at: "2026-03-22T08:00:00Z",
        last_activity: "2026-03-22T10:30:00Z",
        metadata: "{}",
      },
    ],
    limit: 20,
    offset: 0,
  } satisfies EngineConversationListEnvelope,

  messageList: {
    messages: [
      {
        id: "msg-1",
        conversation_id: "conv-1",
        role: "user" as const,
        content: "check servers",
        created_at: "2026-03-22T10:00:00Z",
      },
      {
        id: "msg-2",
        conversation_id: "conv-1",
        role: "assistant" as const,
        content: "All servers OK",
        created_at: "2026-03-22T10:00:05Z",
      },
    ],
    limit: 50,
    offset: 0,
  } satisfies EngineMessageListEnvelope,

  heartbeat: {
    enabled: true,
    interval_seconds: 300,
    last_run: "2026-03-22T10:00:00Z",
    next_run: "2026-03-22T10:05:00Z",
    consecutive_failures: 0,
    prompt: "Check inbox",
  } satisfies EngineHeartbeatResponse,

  status: {
    version: "0.1.0",
    uptime: "2h30m15s",
    queue: {
      running: true,
      current_job: "job-abc",
      source: "dashboard",
      queue_depth: 3,
    },
    claude_auth: "connected" as const,
    database_size_bytes: 524288,
    heartbeat: {
      enabled: true,
      last_run: "2026-03-22T10:00:00Z",
      next_run: "2026-03-22T10:05:00Z",
      consecutive_failures: 0,
      interval_seconds: 300,
    },
  } satisfies EngineStatusResponse,

  authStatus: {
    status: "authenticated" as const,
    message: "Claude Code is authenticated",
  } satisfies EngineAuthStatusResponse,

  terminalTicket: {
    ticket: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6abcd",
  } satisfies EngineTerminalTicketResponse,

  logs: {
    lines: [
      "2026-03-22T10:00:00Z [INFO] Engine started",
      "2026-03-22T10:00:01Z [INFO] Heartbeat enabled (300s interval)",
      "2026-03-22T10:05:00Z [INFO] Heartbeat check completed",
    ],
  } satisfies EngineLogEnvelope,

  telegramConfig: {
    enabled: true,
    allowed_users: ["12345", "67890"],
    webhook_url: "https://api.telegram.org/bot.../webhook",
    status: "connected",
    status_message: "Bot is running",
    updated_at: "2026-03-22T10:00:00Z",
  } satisfies EngineTelegramConfigResponse,

  discordConfig: {
    enabled: true,
    allowed_users: ["123456789012345678"],
    status: "connected",
    status_message: "Bot is running",
    updated_at: "2026-03-22T10:00:00Z",
  } satisfies EngineDiscordConfigResponse,

  flightRecorderStatus: {
    enabled: true,
    buffer_stats: {
      capacity: 2097152,
      used_bytes: 4096,
      total_written: 10,
      dropped: 0,
      wrapped: false,
    },
    snapshot_count: 2,
    runtime_trace_enabled: true,
  } satisfies EngineFlightRecorderStatus,

  snapshot: {
    id: "20260326T143022Z",
    reason: "manual",
    timestamp: "2026-03-26T14:30:22Z",
    event_count: 42,
    buffer_stats: {
      capacity: 2097152,
      used_bytes: 4096,
      total_written: 42,
      dropped: 0,
      wrapped: false,
    },
    directory: "/data/snapshots/20260326T143022Z_manual",
    has_runtime_trace: true,
  } satisfies EngineSnapshotInfo,
};
