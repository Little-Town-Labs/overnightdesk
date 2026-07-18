import assert from "node:assert/strict";
import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  verify,
} from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { instance, oauthClient, user } from "@/db/schema";
import {
  activateHermesOidcClient,
  disableHermesOidcClient,
  ensureHermesOidcClient,
} from "@/lib/hermes-oidc";

if (
  !process.env.DATABASE_TEST_URL ||
  process.env.DATABASE_URL !== process.env.DATABASE_TEST_URL
) {
  throw new Error("Qualification requires one disposable DATABASE_TEST_URL as DATABASE_URL");
}
const databaseName = new URL(process.env.DATABASE_TEST_URL).pathname.slice(1);
if (!/^overnightdesk_oidc_[a-z0-9_]+$/.test(databaseName)) {
  throw new Error("Qualification refuses a non-disposable database");
}

const issuer = "https://www.overnightdesk.com/api/auth";
const callback = "https://protocol-test.overnightdesk.com/auth/callback";
const ownerId = `oidc-owner-${crypto.randomUUID()}`;
const otherId = `oidc-other-${crypto.randomUUID()}`;
const instanceId = `oidc-instance-${crypto.randomUUID()}`;
const qualificationIp = "198.51.100.10";
let clientId = "";
let currentStage = "setup";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

async function sessionCookie(userId: string) {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  const signature = createHmac("sha256", context.secret)
    .update(session.token)
    .digest("base64");
  return `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
}

function authorizationUrl(
  challenge: string,
  overrides: Record<string, string | null> = {}
) {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "openid profile email",
    state: `state-${crypto.randomUUID()}`,
    nonce: `nonce-${crypto.randomUUID()}`,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) query.delete(key);
    else query.set(key, value);
  }
  return `${issuer}/oauth2/authorize?${query}`;
}

async function authorize(
  cookie: string,
  challenge: string,
  overrides: Record<string, string | null> = {}
) {
  return auth.handler(
    new Request(authorizationUrl(challenge, overrides), {
      headers: { cookie, "x-forwarded-for": qualificationIp },
      redirect: "manual",
    })
  );
}

function authorizationCode(response: Response) {
  const location = response.headers.get("location");
  return location ? new URL(location).searchParams.get("code") : null;
}

async function exchange(
  code: string,
  verifier?: string,
  overrides: Record<string, string> = {}
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: callback,
    ...overrides,
  });
  if (verifier !== undefined) body.set("code_verifier", verifier);
  return auth.handler(
    new Request(`${issuer}/oauth2/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": qualificationIp,
      },
      body,
    })
  );
}

function assertClientError(response: Response) {
  assert.ok(response.status >= 400 && response.status < 500);
}

async function requireCode(cookie: string, challenge: string) {
  const response = await authorize(cookie, challenge);
  assert.equal(response.status, 302);
  const code = authorizationCode(response);
  assert.ok(code);
  return code;
}

async function main() {
  let ownerCookie = "";
  let otherCookie = "";
  let checks = 0;

  try {
    currentStage = "seed test identities";
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Protocol Owner",
        email: `${ownerId}@example.com`,
        emailVerified: true,
      },
      {
        id: otherId,
        name: "Other Owner",
        email: `${otherId}@example.com`,
        emailVerified: true,
      },
    ]);
    await db.insert(instance).values({
      id: instanceId,
      userId: ownerId,
      tenantId: "protocol-test",
      subdomain: "protocol-test.overnightdesk.com",
      status: "running",
    });
    currentStage = "create OIDC client";
    clientId = (
      await ensureHermesOidcClient({
        instanceId,
        ownerId,
        subdomain: "protocol-test.overnightdesk.com",
      })
    ).clientId;
    currentStage = "activate OIDC client";
    await activateHermesOidcClient({
      instanceId,
      ownerId,
      subdomain: "protocol-test.overnightdesk.com",
    });
    currentStage = "create authenticated sessions";
    ownerCookie = await sessionCookie(ownerId);
    otherCookie = await sessionCookie(otherId);

    currentStage = "authorize happy path";
    const happyPkce = pkce();
    const happyState = `state-${crypto.randomUUID()}`;
    const happyNonce = `nonce-${crypto.randomUUID()}`;
    const happyAuthorization = await authorize(
      ownerCookie,
      happyPkce.challenge,
      { state: happyState, nonce: happyNonce }
    );
    assert.equal(happyAuthorization.status, 302);
    const happyLocation = happyAuthorization.headers.get("location");
    assert.ok(happyLocation);
    const happyRedirect = new URL(happyLocation);
    assert.equal(happyRedirect.searchParams.get("state"), happyState);
    const code = happyRedirect.searchParams.get("code");
    assert.ok(code);
    currentStage = "exchange happy-path code";
    const tokenResponse = await exchange(code, happyPkce.verifier);
    assert.equal(tokenResponse.status, 200);
    const tokens = await tokenResponse.json();
    assert.equal(tokens.refresh_token, undefined);
    assert.equal(tokens.expires_in, 900);

    currentStage = "verify ID token";
    const jwksResponse = await auth.handler(
      new Request(`${issuer}/jwks`, {
        headers: { "x-forwarded-for": qualificationIp },
      })
    );
    assert.equal(jwksResponse.status, 200);
    const jwks = await jwksResponse.json();
    const [encodedHeader, encodedPayload, encodedSignature] = tokens.id_token.split(".");
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const jwk = jwks.keys.find((candidate: { kid?: string }) => candidate.kid === header.kid);
    assert.ok(jwk);
    assert.equal(
      verify(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        createPublicKey({ key: jwk, format: "jwk" }),
        Buffer.from(encodedSignature, "base64url")
      ),
      true
    );
    assert.equal(payload.iss, issuer);
    assert.equal(payload.aud, clientId);
    assert.equal(payload.sub, ownerId);
    assert.equal(payload.email, `${ownerId}@example.com`);
    assert.equal(payload.name, "Protocol Owner");
    assert.equal(payload.nonce, happyNonce);
    assert.ok(payload.exp - payload.iat <= 900);
    checks += 13;

    currentStage = "deny code replay";
    assertClientError(await exchange(code, happyPkce.verifier));
    checks += 1;

    for (const suppliedVerifier of ["wrong-verifier", undefined]) {
      currentStage = suppliedVerifier
        ? "deny wrong PKCE verifier"
        : "deny missing PKCE verifier";
      const value = pkce();
      const verifierCode = await requireCode(ownerCookie, value.challenge);
      assertClientError(await exchange(verifierCode, suppliedVerifier));
      checks += 1;
    }

    currentStage = "deny resource indicator";
    const resourcePkce = pkce();
    const resourceCode = await requireCode(ownerCookie, resourcePkce.challenge);
    assert.equal(
      (
        await exchange(resourceCode, resourcePkce.verifier, {
          resource: "https://unexpected.example",
        })
      ).status,
      400
    );
    checks += 1;

    const negativeAuthorizations: Array<[
      string,
      Record<string, string | null>
    ]> = [
      [ownerCookie, { redirect_uri: "https://other.overnightdesk.com/auth/callback" }],
      [ownerCookie, { scope: "openid profile email admin" }],
      [ownerCookie, { state: null }],
      [ownerCookie, { nonce: null }],
      [ownerCookie, { code_challenge_method: "plain" }],
      [otherCookie, {}],
    ];
    currentStage = "deny invalid authorizations";
    for (const [cookie, overrides] of negativeAuthorizations) {
      const response = await authorize(cookie, pkce().challenge, overrides);
      assert.equal(authorizationCode(response), null);
      checks += 1;
    }

    currentStage = "revoke OIDC client";
    await disableHermesOidcClient({
      instanceId,
      ownerId,
      subdomain: "protocol-test.overnightdesk.com",
    });
    assert.equal(
      authorizationCode(await authorize(ownerCookie, pkce().challenge)),
      null
    );
    const disabled = await db
      .select({ disabled: oauthClient.disabled })
      .from(oauthClient)
      .where(
        and(
          eq(oauthClient.clientId, clientId),
          eq(oauthClient.disabled, true)
        )
      );
    assert.equal(disabled.length, 1);
    checks += 2;

    console.log(`Hermes OIDC exchange matrix passed ${checks} checks`);
  } finally {
    await db.delete(instance).where(eq(instance.id, instanceId)).catch(() => undefined);
    if (clientId) {
      await db
        .delete(oauthClient)
        .where(eq(oauthClient.clientId, clientId))
        .catch(() => undefined);
    }
    await db
      .delete(user)
      .where(inArray(user.id, [ownerId, otherId]))
      .catch(() => undefined);
  }
}

main().catch((error) => {
  const kind = error instanceof Error ? error.name : "non-Error rejection";
  console.error(
    `Hermes OIDC exchange qualification failed during ${currentStage} (${kind})`
  );
  process.exitCode = 1;
});
