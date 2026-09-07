-- Generated from Better Auth 1.7.3. Review before applying.
-- Requires 004_owner_auth.sql in the same personal-instance database as Core.
BEGIN;
create table "bob_auth_oauth_client" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" boolean, "skipConsent" boolean, "enableEndSession" boolean, "subjectType" text, "scopes" jsonb, "clientCredentialsScopes" jsonb, "userId" text references "bob_auth_user" ("id") on delete cascade, "createdAt" timestamptz, "updatedAt" timestamptz, "name" text, "uri" text, "icon" text, "contacts" jsonb, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" jsonb not null, "postLogoutRedirectUris" jsonb, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" boolean, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" jsonb, "responseTypes" jsonb, "requirePKCE" boolean, "dpopBoundAccessTokens" boolean, "referenceId" text, "metadata" jsonb);

create table "bob_auth_oauth_resource" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" jsonb, "customClaims" jsonb, "dpopBoundAccessTokensRequired" boolean, "disabled" boolean, "createdAt" timestamptz, "updatedAt" timestamptz, "policyVersion" integer, "metadata" jsonb);

create table "bob_auth_oauth_client_resource" ("id" text not null primary key, "clientId" text not null references "bob_auth_oauth_client" ("clientId") on delete cascade, "resourceId" text not null references "bob_auth_oauth_resource" ("identifier") on delete cascade, "metadata" jsonb, "createdAt" timestamptz);

create table "bob_auth_oauth_refresh_token" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "bob_auth_oauth_client" ("clientId") on delete cascade, "sessionId" text references "bob_auth_session" ("id") on delete set null, "userId" text not null references "bob_auth_user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "rotatedAt" timestamptz, "rotationReplayResponse" text, "rotationReplayExpiresAt" timestamptz, "authTime" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

create table "bob_auth_oauth_access_token" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "bob_auth_oauth_client" ("clientId") on delete cascade, "sessionId" text references "bob_auth_session" ("id") on delete set null, "userId" text references "bob_auth_user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "refreshId" text references "bob_auth_oauth_refresh_token" ("id") on delete cascade, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

create table "bob_auth_oauth_consent" ("id" text not null primary key, "clientId" text not null references "bob_auth_oauth_client" ("clientId") on delete cascade, "userId" text references "bob_auth_user" ("id") on delete cascade, "referenceId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "scopes" jsonb not null, "createdAt" timestamptz not null, "updatedAt" timestamptz not null);

create table "bob_auth_oauth_client_assertion" ("id" text not null primary key, "expiresAt" timestamptz not null);

create index "bob_auth_oauth_client_userId_idx" on "bob_auth_oauth_client" ("userId");

create index "bob_auth_oauth_client_resource_clientId_idx" on "bob_auth_oauth_client_resource" ("clientId");

create index "bob_auth_oauth_client_resource_resourceId_idx" on "bob_auth_oauth_client_resource" ("resourceId");

create index "bob_auth_oauth_refresh_token_clientId_idx" on "bob_auth_oauth_refresh_token" ("clientId");

create index "bob_auth_oauth_refresh_token_sessionId_idx" on "bob_auth_oauth_refresh_token" ("sessionId");

create index "bob_auth_oauth_refresh_token_userId_idx" on "bob_auth_oauth_refresh_token" ("userId");

create index "bob_auth_oauth_refresh_token_authorizationCodeId_idx" on "bob_auth_oauth_refresh_token" ("authorizationCodeId");

create index "bob_auth_oauth_access_token_clientId_idx" on "bob_auth_oauth_access_token" ("clientId");

create index "bob_auth_oauth_access_token_sessionId_idx" on "bob_auth_oauth_access_token" ("sessionId");

create index "bob_auth_oauth_access_token_userId_idx" on "bob_auth_oauth_access_token" ("userId");

create index "bob_auth_oauth_access_token_authorizationCodeId_idx" on "bob_auth_oauth_access_token" ("authorizationCodeId");

create index "bob_auth_oauth_access_token_refreshId_idx" on "bob_auth_oauth_access_token" ("refreshId");

create index "bob_auth_oauth_consent_clientId_idx" on "bob_auth_oauth_consent" ("clientId");

create index "bob_auth_oauth_consent_userId_idx" on "bob_auth_oauth_consent" ("userId");

create unique index "bob_auth_oauth_client_resource_clientId_resourceId_uidx" on "bob_auth_oauth_client_resource" ("clientId", "resourceId");

CREATE TABLE public.bob_oauth_project_grants (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  user_id text NOT NULL REFERENCES bob_auth_user(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES bob_auth_oauth_client("clientId") ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES bob_projects(id) ON DELETE RESTRICT,
  surface text NOT NULL CHECK (surface IN ('chatgpt','codex','copilot','other')),
  scopes text[] NOT NULL CHECK (scopes <@ ARRAY['offline_access','mcp:context:read','mcp:sync','mcp:event:write','mcp:task:write','mcp:decision:propose']::text[]),
  operation_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (owner_id,user_id,operation_id)
);
CREATE INDEX bob_oauth_project_grants_owner_active ON bob_oauth_project_grants(owner_id,created_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX bob_oauth_project_grants_project ON bob_oauth_project_grants(project_id);
CREATE INDEX bob_oauth_access_reference ON bob_auth_oauth_access_token("referenceId","userId");
CREATE INDEX bob_oauth_refresh_reference ON bob_auth_oauth_refresh_token("referenceId","userId");
CREATE INDEX bob_oauth_consent_reference ON bob_auth_oauth_consent("referenceId","userId");
COMMIT;
