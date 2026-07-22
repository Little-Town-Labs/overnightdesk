import { db } from "@/db";
import {
  applyOpenWebuiProvisioning,
  applyOpenWebuiRefreshContract,
  inspectOpenWebuiProvisioning,
  setOpenWebuiClientEnabled,
  type OpenWebuiProvisioningInspection,
} from "@/db/open-webui-provisioning-store";
import { TITUS_OPEN_WEBUI } from "@/lib/open-webui-deployments";

type Database = typeof db;
export type TitusOpenWebuiProvisioningInspection = OpenWebuiProvisioningInspection;

export const inspectTitusOpenWebuiProvisioning = (database: Database = db) =>
  inspectOpenWebuiProvisioning(TITUS_OPEN_WEBUI, database);

export const applyTitusOpenWebuiProvisioning = (
  inspection: Extract<OpenWebuiProvisioningInspection, { status: "ready" }>,
  actor: string,
  database: Database = db,
) => applyOpenWebuiProvisioning(TITUS_OPEN_WEBUI, inspection, actor, database);

export const setTitusOpenWebuiClientEnabled = (
  enabled: boolean,
  actor: string,
  database: Database = db,
) => setOpenWebuiClientEnabled(TITUS_OPEN_WEBUI, enabled, actor, database);

export const applyTitusOpenWebuiRefreshContract = (
  inspection: Extract<
    OpenWebuiProvisioningInspection,
    { status: "refresh-required" }
  >,
  actor: string,
  database: Database = db,
) => applyOpenWebuiRefreshContract(TITUS_OPEN_WEBUI, inspection, actor, database);
