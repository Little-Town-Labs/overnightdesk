import { db } from "@/db";
import {
  applyOpenWebuiProvisioning,
  inspectOpenWebuiProvisioning,
  setOpenWebuiClientEnabled,
  type OpenWebuiProvisioningInspection,
} from "@/db/open-webui-provisioning-store";
import { WALTER_OPEN_WEBUI } from "@/lib/open-webui-deployments";

type Database = typeof db;
export type WalterOpenWebuiProvisioningInspection = OpenWebuiProvisioningInspection;

export const inspectWalterOpenWebuiProvisioning = (database: Database = db) =>
  inspectOpenWebuiProvisioning(WALTER_OPEN_WEBUI, database);

export const applyWalterOpenWebuiProvisioning = (
  inspection: Extract<OpenWebuiProvisioningInspection, { status: "ready" }>,
  actor: string,
  database: Database = db,
) => applyOpenWebuiProvisioning(WALTER_OPEN_WEBUI, inspection, actor, database);

export const setWalterOpenWebuiClientEnabled = (
  enabled: boolean,
  actor: string,
  database: Database = db,
) => setOpenWebuiClientEnabled(WALTER_OPEN_WEBUI, enabled, actor, database);
