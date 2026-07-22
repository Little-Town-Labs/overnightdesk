import { TITUS_OPEN_WEBUI } from "@/lib/open-webui-deployments";
import {
  buildOpenWebuiProvisioningSpec,
  classifyOpenWebuiProvisioningSnapshot,
  verifyOpenWebuiProvisioningSnapshot,
  type OpenWebuiClient,
  type OpenWebuiIdentity,
  type OpenWebuiProvisioningSnapshot,
  type OpenWebuiResourceBinding,
} from "@/lib/open-webui-provisioning";

export type TitusOpenWebuiIdentity = OpenWebuiIdentity;
export type TitusOpenWebuiResourceBinding = OpenWebuiResourceBinding;
export type TitusOpenWebuiClient = OpenWebuiClient;
export type TitusOpenWebuiProvisioningSnapshot = OpenWebuiProvisioningSnapshot;

export function buildTitusOpenWebuiProvisioningSpec(identity: TitusOpenWebuiIdentity) {
  return buildOpenWebuiProvisioningSpec(TITUS_OPEN_WEBUI, identity);
}

export function classifyTitusOpenWebuiProvisioningSnapshot(
  snapshot: TitusOpenWebuiProvisioningSnapshot,
) {
  return classifyOpenWebuiProvisioningSnapshot(TITUS_OPEN_WEBUI, snapshot);
}

export function verifyTitusOpenWebuiProvisioningSnapshot(
  snapshot: TitusOpenWebuiProvisioningSnapshot,
) {
  try {
    return verifyOpenWebuiProvisioningSnapshot(TITUS_OPEN_WEBUI, snapshot);
  } catch {
    throw new Error("Invalid Titus Open WebUI provisioning state");
  }
}
