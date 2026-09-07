import { randomUUID } from "node:crypto";

export async function seedOAuthRecoveryFixture(pool, owner, project) {
  const client = randomUUID();
  const grant = randomUUID();
  const refresh = randomUUID();
  await pool.query(
    `INSERT INTO bob_auth_oauth_client(id,"clientId","clientSecret","redirectUris","userId")
    VALUES($1,$1,'synthetic-unusable-hash','[]','drill-owner')`,
    [client],
  );
  await pool.query(
    `INSERT INTO bob_oauth_project_grants(id,owner_id,user_id,client_id,project_id,surface,scopes,operation_id,request_fingerprint)
    VALUES($1,$2,'drill-owner',$3,$4,'chatgpt',ARRAY['mcp:context:read','mcp:sync'],$5,$6)`,
    [grant, owner, client, project, randomUUID(), "a".repeat(64)],
  );
  await pool.query(
    `INSERT INTO bob_auth_oauth_refresh_token(id,token,"clientId","userId","referenceId","expiresAt","createdAt",scopes)
    VALUES($1,$1,$2,'drill-owner',$3,now()+interval '1 day',now(),'["mcp:context:read","mcp:sync"]')`,
    [refresh, client, grant],
  );
  await pool.query(
    `INSERT INTO bob_auth_oauth_access_token(id,token,"clientId","userId","referenceId","refreshId","expiresAt","createdAt",scopes)
    VALUES($1,$1,$2,'drill-owner',$3,$4,now()+interval '1 hour',now(),'["mcp:context:read","mcp:sync"]')`,
    [randomUUID(), client, grant, refresh],
  );
  await pool.query(
    `INSERT INTO bob_auth_oauth_consent(id,"clientId","userId","referenceId","createdAt","updatedAt",scopes)
    VALUES($1,$2,'drill-owner',$3,now(),now(),'["mcp:context:read","mcp:sync"]')`,
    [randomUUID(), client, grant],
  );
  return { client, grant };
}

export async function assertOAuthRecoveryRevoked(assert, pool, grant) {
  for (const table of [
    "bob_auth_oauth_access_token",
    "bob_auth_oauth_refresh_token",
    "bob_auth_oauth_consent",
  ])
    assert.equal(
      Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count),
      0,
      `${table} cleared`,
    );
  assert.ok(
    (
      await pool.query(
        "SELECT revoked_at FROM bob_oauth_project_grants WHERE id=$1",
        [grant],
      )
    ).rows[0].revoked_at,
    "Copied OAuth project grant revoked",
  );
}
