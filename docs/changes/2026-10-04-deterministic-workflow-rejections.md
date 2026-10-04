# Deterministic command rejection recovery

PR48 finding r4178133108 reproduced on f3c0dff: four service errors occurring after empty receipt lookup and before writes incorrectly reported unconfirmed. The Web client therefore retained a doomed request rather than permitting corrected capture.

Added only workflow_packet_capacity, packet_already_exists_or_version_conflict, invalid_predecessor_scope and released_packet_immutable to the existing explicit rejected map. A pinned transaction propagates these errors only after successful rollback; uncertain rollback/COMMIT use distinct503 codes and remain unconfirmed. Access/revocation/pause, operation receipt conflicts and transport errors remain unconfirmed. No changes to identity, authority, state transition rules or durable writes.

Regression scope: actual service+router checks all four with no writes; real isolated PostgreSQL verifies unchanged packets/history/records/receipts, existing receipt replay and uncertain rollback; rendered Web invalid-predecessor capture must clear pending and accept corrected capture. Existing lost-response/commit retry, auth/project and immutable approval tests retained. Harness receipt counts adjusted for added cases only. Review packet holds exact final check receipts and hashes; no publication before independent review.

No live database/configuration, credentials/grants, protection changes, merge or activation. Original dirty work and previous reviewed checkpoint preserved.
