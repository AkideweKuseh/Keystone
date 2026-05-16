-- Audit log immutability grants
-- Run once after initial migration as a DBA / superuser.
-- The application role (app) must NOT be able to UPDATE or DELETE
-- rows from audit_log — this prevents log tampering after an incident.

-- Revoke UPDATE and DELETE on audit_log from the app role
REVOKE UPDATE, DELETE ON audit_log FROM app;

-- Verify: the app role can still INSERT (write new entries)
-- but cannot modify or remove existing ones.
-- Test with: SET ROLE app; UPDATE audit_log SET result='failure' WHERE 1=0;
-- Expected: ERROR: permission denied for table audit_log
