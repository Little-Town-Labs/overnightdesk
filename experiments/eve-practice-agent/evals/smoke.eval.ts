import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";

export default defineEval({
  description: "Returns a deterministic text reply without invoking tools.",
  async test(t) {
    await t.send("hello practice");

    t.succeeded();
    t.check(t.reply, equals("Practice echo: hello practice"));
    t.usedNoTools();
    t.noFailedActions();
  },
});
