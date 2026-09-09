import type { Pool } from "@neondatabase/serverless";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { APIError } from "better-auth/api";
import {
  liveGrant,
  mcpResource,
  OAUTH_SCOPES,
  type ProjectGrant,
} from "./oauth-grants";

export type ApprovedProjectGrant = ProjectGrant | (() => Promise<ProjectGrant>);
export type ClientProvisioning =
  boolean | { clientId: string; clientSecret?: string };

export function projectOAuthPlugins(
  pool: Pool,
  approval?: ApprovedProjectGrant,
  provisionClients: ClientProvisioning = false,
) {
  let approved: Promise<ProjectGrant> | undefined;
  const resolveApproval = () =>
    (approved ??= Promise.resolve(
      typeof approval === "function" ? approval() : approval!,
    ));
  const resource = mcpResource();
  return [
    mcp({
      loginPage: "/login",
      consentPage: "/connect",
      resource,
      scopes: OAUTH_SCOPES,
      grantTypes: ["authorization_code", "refresh_token"],
      // Opaque resource-bound tokens make standard token revocation effective
      // on the next introspection. The public MCP client needs no shared secret.
      disableJwtPlugin: true,
      storeTokens: "hashed",
      accessTokenExpiresIn: 15 * 60,
      refreshTokenExpiresIn: 30 * 24 * 60 * 60,
      codeExpiresIn: 5 * 60,
      refreshTokenReuseInterval: 0,
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      ...(typeof provisionClients === "object"
        ? {
            generateClientId: () => provisionClients.clientId,
            ...(provisionClients.clientSecret
              ? { generateClientSecret: () => provisionClients.clientSecret! }
              : {}),
          }
        : {}),
      resources: [
        {
          identifier: resource,
          allowedScopes: OAUTH_SCOPES,
          accessTokenTtl: 15 * 60,
        },
      ],
      resourcePrivileges: () => false,
      clientPrivileges: ({ action, user }) =>
        !!provisionClients &&
        action === "create" &&
        !!user &&
        user.email.toLowerCase() ===
          process.env.BOB_AUTH_OWNER_EMAIL?.trim().toLowerCase(),
      postLogin: {
        page: "/connect",
        shouldRedirect: async () => !approval,
        consentReferenceId: async ({ user, scopes }) => {
          // Better Auth verifies the signed OAuth query before calling this hook.
          const approvedGrant = approval ? await resolveApproval() : undefined;
          if (
            !approvedGrant ||
            !user ||
            approvedGrant.user_id !== user.id ||
            !scopes.every((scope) => approvedGrant.scopes.includes(scope)) ||
            !(await liveGrant(pool, approvedGrant.id, user.id))
          )
            throw new APIError("FORBIDDEN", {
              error: "access_denied",
              error_description: "Owner project approval is required.",
            });
          return approvedGrant.id;
        },
      },
      customAccessTokenClaims: async ({
        user,
        referenceId,
        scopes,
        resources,
      }) => {
        const grant =
          user && referenceId
            ? await liveGrant(pool, referenceId, user.id)
            : null;
        if (
          !grant ||
          !resources?.includes(resource) ||
          !scopes.every((scope) => grant.scopes.includes(scope))
        )
          throw new APIError("FORBIDDEN", {
            error: "access_denied",
            error_description:
              "The project connection is unavailable or revoked.",
          });
        return {
          bob_grant_id: grant.id,
          bob_project_key: grant.project_key,
          bob_surface: grant.surface,
          bob_owner_id: grant.owner_id,
        };
      },
      schema: {
        oauthClient: { modelName: "bob_auth_oauth_client" },
        oauthAccessToken: { modelName: "bob_auth_oauth_access_token" },
        oauthRefreshToken: { modelName: "bob_auth_oauth_refresh_token" },
        oauthConsent: { modelName: "bob_auth_oauth_consent" },
        oauthClientAssertion: { modelName: "bob_auth_oauth_client_assertion" },
        oauthResource: { modelName: "bob_auth_oauth_resource" },
        oauthClientResource: { modelName: "bob_auth_oauth_client_resource" },
      },
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  ];
}
