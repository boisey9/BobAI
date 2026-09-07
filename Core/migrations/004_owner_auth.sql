-- Generated from Better Auth 1.7.3. Review before applying.
BEGIN;
create table "bob_auth_user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "bob_auth_session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "bob_auth_user" ("id") on delete cascade);

create table "bob_auth_account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "bob_auth_user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "bob_auth_verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "bob_auth_passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "bob_auth_user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" boolean not null, "transports" text, "createdAt" timestamptz, "aaguid" text);

create table "bob_auth_rate_limit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "bob_auth_session_userId_idx" on "bob_auth_session" ("userId");

create index "bob_auth_account_userId_idx" on "bob_auth_account" ("userId");

create index "bob_auth_verification_identifier_idx" on "bob_auth_verification" ("identifier");

create index "bob_auth_passkey_userId_idx" on "bob_auth_passkey" ("userId");

create index "bob_auth_passkey_credentialID_idx" on "bob_auth_passkey" ("credentialID");

-- This release is a single-owner deployment, including under concurrent bootstrap.
create unique index "bob_auth_single_owner_idx" on "bob_auth_user" ((true));
COMMIT;
