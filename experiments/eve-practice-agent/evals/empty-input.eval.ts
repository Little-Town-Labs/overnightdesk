import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";

export default defineEval({
  description: "Parks a whitespace-only turn after local prompt validation fails.",
  async test(t) {
    const turn = await t.send(" \n ");

    t.check(turn.status, equals("waiting"));
    turn.usedNoTools();
  },
});
