import { defineAgent } from "eve";

import { createPracticeModel } from "./lib/model.js";

export default defineAgent({
  model: createPracticeModel(process.env.EVE_PRACTICE_MODEL),
  modelContextWindowTokens: 200_000,
  reasoning: "medium",
  limits: {
    maxInputTokensPerSession: 50_000,
    maxOutputTokensPerSession: 4_000,
    sessionTimeoutMs: 4 * 60 * 60 * 1_000,
  },
});
