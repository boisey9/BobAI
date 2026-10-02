import { governedPolicy, governedPolicyDigest, storedPacket, WorkflowError, type GovernedPolicy, type PacketPrincipal,
  type WorkPacket, type WorkflowRecord } from "./packet-contract.js";

// One pinned connection, explicit BEGIN/COMMIT/ROLLBACK. A list of independent
// HTTP statements is not a transaction runner. Not wired into normal runtime.
export type WorkflowQuery = (sql: string, parameters?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type WorkflowTransaction = <T>(run: (query: WorkflowQuery) => Promise<T>) => Promise<T>;
export type WorkflowSnapshot = { policy: GovernedPolicy | null; paused: boolean; now: number;
  packets: WorkPacket[]; records: WorkflowRecord[]; query: WorkflowQuery;
  insertRecord(record: WorkflowRecord): Promise<void>;
  savePacket(packet: WorkPacket): Promise<void> };
export type WorkflowPermission = "read" | "edit" | "review";

export class PostgresPacketStore {
  constructor(private readonly transaction: WorkflowTransaction) {}
  async scoped<T>(p: PacketPrincipal, permission: WorkflowPermission,
    run: (snapshot: WorkflowSnapshot) => Promise<T>): Promise<T> {
    return this.transaction(async query => {
      await query("SELECT set_config('bob.workflow_owner',$1,true), set_config('bob.workflow_project',$2,true)", [p.ownerId, p.projectKey]);
      // All packet, evidence, governance and grant changes for a project must use
      // this lock; SERIALIZABLE retry belongs in the injected runner if used.
      await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`bob-workflow:${p.ownerId.length}:${p.ownerId}:${p.projectKey}`]);
      const auth = await query(`SELECT p.policy, p.paused, g.can_edit, g.can_review,
        extract(epoch FROM clock_timestamp()) * 1000 AS now
        FROM bob_workflow.projects p JOIN bob_workflow.grants g USING(owner_id,project_key)
        WHERE p.owner_id=$1 AND p.project_key=$2 AND g.actor_id=$3 AND g.enabled=true
        `, [p.ownerId,p.projectKey,p.actorId]);
      const a = auth.rows[0];
      if (!a || permission === "edit" && a.can_edit !== true || permission === "review" && a.can_review !== true)
        throw new WorkflowError("workflow_access_denied",403);
      if (permission !== "read" && a.paused !== false) throw new WorkflowError("workflow_paused",409);
      const packetRows = await query("SELECT document FROM bob_workflow.packets WHERE owner_id=$1 AND project_key=$2 ORDER BY id LIMIT 501",[p.ownerId,p.projectKey]);
      const recordRows = await query(`SELECT r.id,r.packet_id,r.kind,r.content || CASE WHEN r.kind='approval' THEN
        jsonb_build_object('consumed',EXISTS(SELECT 1 FROM bob_workflow.receipts op WHERE op.owner_id=r.owner_id
          AND op.project_key=r.project_key AND op.approval_id=r.id)) ELSE '{}'::jsonb END AS content,r.created_at
        FROM bob_workflow.records r WHERE r.owner_id=$1 AND r.project_key=$2 ORDER BY r.created_at,r.id LIMIT 10001`,[p.ownerId,p.projectKey]);
      if (packetRows.rows.length > 500 || recordRows.rows.length > 10000) throw new WorkflowError("workflow_capacity_requires_review",503);
      const packets = packetRows.rows.map(row => storedPacket.parse(row.document));
      const records: WorkflowRecord[] = recordRows.rows.map(row => ({ id: String(row.id), packetId: String(row.packet_id),
        kind: row.kind as WorkflowRecord["kind"], content: row.content as Record<string,unknown>, createdAt: new Date(String(row.created_at)).toISOString() }));
      const policy = a.policy === null ? null : governedPolicy.parse(a.policy);
      if(policy && policy.digest!==governedPolicyDigest(policy)) throw new WorkflowError("workflow_policy_digest_mismatch",503);
      if(policy){
        const version=await query("SELECT policy FROM bob_workflow.policy_versions WHERE owner_id=$1 AND project_key=$2 AND version_id=$3",[p.ownerId,p.projectKey,policy.versionId]);
        const stored=version.rows[0]?.policy;
        if(!stored||governedPolicy.parse(stored).digest!==policy.digest||JSON.stringify(governedPolicy.parse(stored))!==JSON.stringify(policy))throw new WorkflowError("workflow_policy_version_unavailable",503);
      }
      if (policy && (new Set(policy.requiredChecks).size !== policy.requiredChecks.length || new Set(policy.trustedIssuers).size !== policy.trustedIssuers.length))
        throw new WorkflowError("workflow_policy_invalid",503);
      return run({ policy, paused: a.paused === true, now: Math.floor(Number(a.now)), packets, records, query,
        async insertRecord(record) {
          if (records.length >= 10000) throw new WorkflowError("workflow_record_capacity",503);
          await query("INSERT INTO bob_workflow.records(owner_id,project_key,id,packet_id,kind,content,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz)",
            [p.ownerId,p.projectKey,record.id,record.packetId,record.kind,JSON.stringify(record.content),record.createdAt]);
          records.push(record);
        },
        async savePacket(packet) {
          storedPacket.parse(packet);
          await query(`INSERT INTO bob_workflow.packets(owner_id,project_key,id,document) VALUES($1,$2,$3,$4::jsonb)
            ON CONFLICT(owner_id,project_key,id) DO UPDATE SET document=EXCLUDED.document`,
            [p.ownerId,p.projectKey,packet.id,JSON.stringify(packet)]);
        },
      });
    });
  }
}
