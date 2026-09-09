import type { Pool } from "@neondatabase/serverless";
import { ownerEmail } from "./owner-auth";

// Expired browser sessions must stop authorizing access while an explicitly
// approved offline connection can renew. PostgreSQL's session FK detaches the
// preserved refresh tokens when the expired session is removed.
export async function retireExpiredOAuthSessions(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const expired = await client.query(
      `SELECT s.id FROM bob_auth_session s JOIN bob_auth_user u ON u.id=s."userId"
      WHERE u.email=$1 AND s."expiresAt"<=now() FOR UPDATE OF s`,
      [ownerEmail()],
    );
    const ids = expired.rows.map((row) => row.id);
    if (ids.length) {
      await client.query(
        'UPDATE bob_auth_oauth_access_token SET revoked=COALESCE(revoked,now()) WHERE "sessionId"=ANY($1::text[])',
        [ids],
      );
      await client.query(
        `UPDATE bob_auth_oauth_refresh_token SET revoked=COALESCE(revoked,now())
        WHERE "sessionId"=ANY($1::text[]) AND NOT scopes @> '["offline_access"]'::jsonb`,
        [ids],
      );
      await client.query(
        "DELETE FROM bob_auth_session WHERE id=ANY($1::text[])",
        [ids],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
