# Consent evidence: nothing reads as tampered unless it was

The failure this rule exists to prevent: a column added to a consent register turned every outside timestamp seal into a false "changed after sealing" verdict. Evidence that cries wolf is worse than no evidence.

## The rule

1. **A seal names what it covers.** Every outside timestamp records the exact column list it digested, and verification digests only those columns. A column added later never touches an existing seal.
2. **A sealed column never changes shape.** No migration may drop, rename or retype a column of the consent event table, or of any table a seal covers. Enforce it in code: the migration applier refuses such a file before connecting, and after any apply re-verifies every seal, exiting non-zero on any failure.
3. **Every seal is re-verified daily.** A scheduled check re-reads all seals once a day and exits non-zero naming each record that fails, so job health shows it red the same day.
4. **A real change must still fail.** The rule removes false positives, never true ones: a row that actually changed after sealing reads as changed, loudly.
5. **Evidence lives in the register.** A file beside the register is never presented as register-backed proof.
