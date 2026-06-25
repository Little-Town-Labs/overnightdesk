import { provisionerClient } from "@/lib/provisioner";
import { mitchelProspectingSummarySchema } from "./schemas";
import { createUnavailableMitchelProspectingSummary } from "./summary";
import type { MitchelProspectingSummary } from "./types";

export async function fetchMitchelProspectingSummary(
  containerId: string
): Promise<MitchelProspectingSummary> {
  const raw = await provisionerClient.getMitchelProspectingSummary(containerId);
  const parsed = mitchelProspectingSummarySchema.safeParse(raw);

  if (!parsed.success) {
    return createUnavailableMitchelProspectingSummary();
  }

  return parsed.data;
}
