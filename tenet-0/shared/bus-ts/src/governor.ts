import type { Bus } from "./bus.js";
import { ErrBudgetBlocked } from "./errors.js";
import { budgetStatus } from "./status.js";
import type { BudgetStatusResult } from "./types.js";

// ClaudeClient is the narrow interface the Governor wraps. Implement with the
// official Anthropic SDK or a fake for tests.
export interface ClaudeClient {
  createMessage(req: ClaudeRequest): Promise<ClaudeResponse>;
}

export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
}

export interface ClaudeMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

// Governor wraps Claude API calls with pre-flight budget checks and
// post-flight usage recording against the token_usage ledger.
export class Governor {
  private readonly bus: Bus;

  constructor(bus: Bus) {
    this.bus = bus;
  }

  async checkBudget(): Promise<BudgetStatusResult> {
    return this.bus.checkBudget();
  }

  // call pre-checks budget, invokes the client, then records usage. Throws
  // ErrBudgetBlocked if the department is at or over its monthly limit —
  // Claude is not invoked in that case. Usage is also recorded on client
  // errors when any tokens were consumed.
  async call(
    client: ClaudeClient,
    req: ClaudeRequest,
  ): Promise<ClaudeResponse> {
    const st = await this.checkBudget();
    if (st.status === budgetStatus.blocked) {
      throw new ErrBudgetBlocked();
    }

    let resp: ClaudeResponse;
    try {
      resp = await client.createMessage(req);
    } catch (err) {
      // Best-effort usage recording even on error.
      const partial = (err as { response?: Partial<ClaudeResponse> }).response;
      const input = partial?.inputTokens ?? 0;
      const output = partial?.outputTokens ?? 0;
      if (input > 0 || output > 0) {
        await this.recordUsage(req.model, input, output).catch((recErr) => {
          console.warn(
            "governor: record_token_usage failed on call error path:",
            recErr,
          );
        });
      }
      throw err;
    }

    await this.recordUsage(req.model, resp.inputTokens, resp.outputTokens).catch(
      (err) => {
        console.warn("governor: record_token_usage failed:", err);
      },
    );

    return resp;
  }

  private async recordUsage(
    model: string,
    input: number,
    output: number,
  ): Promise<void> {
    await this.bus.pool.query(
      `SELECT cost_cents, budget_status FROM record_token_usage($1, $2, $3, $4, NULL)`,
      [this.bus.config.credential, model, input, output],
    );
  }
}
