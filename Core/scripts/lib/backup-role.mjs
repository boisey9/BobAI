import { quoteIdentifier } from "./backup.mjs";

// The caller owns the transaction and private credential output. This role can
// read logical backup data and write only the backup operational ledger.
export async function provisionBackupRole(client, role, password) {
  if (!/^bob_backup_[a-z0-9_]{1,40}$/.test(role) || !/^[A-Za-z0-9_-]{40,100}$/.test(password))
    throw new Error("Invalid backup credential parameters.");
  const quoted = quoteIdentifier(role);
  await client.query(`CREATE ROLE ${quoted} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${quoted}`);
  await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoted}`);
  await client.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoted}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${quoted}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO ${quoted}`);
  await client.query(`GRANT INSERT,UPDATE ON public.bob_backup_runs TO ${quoted}`);
}
