# Backup, restore and rollback rehearsal

- [ ] Identify the isolated staging database and record its owner, region, retention and restore point.
- [ ] Create a provider backup before schema work; verify backup completion and checksum/metadata.
- [ ] Restore into a separate disposable project; compare table/column/function/policy/grant counts and run role, race and payment tests.
- [ ] Verify private Storage objects restore consistently with metadata and access policies.
- [ ] Exercise payment reconciliation before restoring any financial records; never replay provider events against real money.
- [ ] Rehearse application rollback while preserving privacy guards, payment ledgers/inbox/outbox, private uploads and account-erasure state.
- [ ] Record recovery time, data-loss window and operator decisions. Keep identifiers and row-level data in the protected change system only.
- [ ] Assign a human approver for forward migration, backup restore and final release decision.
