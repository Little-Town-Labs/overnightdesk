import type { LanguageModel } from "ai";
import { mockModel } from "eve/evals";
import { chatgpt } from "eve/models/openai";

export type PracticeModelMode = "chatgpt" | "mock";

const INVALID_MODEL_MODE_MESSAGE =
  "EVE_PRACTICE_MODEL must be either chatgpt or mock.";

export function resolvePracticeModelMode(
  value: string | undefined,
): PracticeModelMode {
  if (value === undefined || value === "") {
    return "chatgpt";
  }

  if (value === "chatgpt" || value === "mock") {
    return value;
  }

  throw new Error(INVALID_MODEL_MODE_MESSAGE);
}

export function createPracticeModel(
  value: string | undefined,
): LanguageModel {
  const mode = resolvePracticeModelMode(value);

  if (mode === "mock") {
    return mockModel(({ lastUserMessage }) =>
      `Practice echo: ${lastUserMessage ?? ""}`,
    );
  }

  return chatgpt();
}
