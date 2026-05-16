# Key Rotation Procedure

Covers: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DEVICE_SECRET_KEY`.

## JWT Secret Rotation (zero-downtime)

JWT secrets are validated at runtime. All currently-issued tokens become invalid on rotation.

1. **Pre-rotate:** Confirm all active admin sessions are acceptable to invalidate (or schedule during low-traffic window).
2. Generate new secrets:
   ```bash
   openssl rand -base64 48  # for access secret
   openssl rand -base64 48  # for refresh secret
   ```
3. Update secrets in your secret manager (Vault / AWS Secrets Manager / etc.).
4. Rolling-restart API pods — new pods pick up new secret; old tokens fail.
5. All refresh tokens in DB are now invalid. Admins must re-login.

**Post-rotation check:**

```bash
# Verify new login works
curl -X POST /api/v1/auth/login -d '{"email":"admin@localhost","password":"..."}'
# Expected: 200 + new token pair
```

## DEVICE_SECRET_KEY Rotation (requires re-encryption)

This key encrypts device passwords at rest. Rotation requires re-encrypting all rows.

1. Stop worker and receiver (no new device calls during migration).
2. Generate new key: `openssl rand -base64 32 | base64`
3. Run re-encryption script:
   ```typescript
   // scripts/rotate-device-key.ts
   // 1. Decrypt each device.passwordEncrypted with OLD key
   // 2. Re-encrypt with NEW key
   // 3. Update DB row
   // Run in a transaction; verify count before commit
   ```
4. Update `DEVICE_SECRET_KEY` in secret manager.
5. Restart all services.
6. Verify: `POST /api/v1/devices/:id/health-check` for 5 devices.

## Push Token Rotation (weekly, automated)

Device push tokens are rotated by the platform weekly. No manual action required.

If a token must be revoked immediately:

```sql
UPDATE devices SET push_token = NULL, push_token_expires_at = NULL WHERE id = '<device_id>';
```

Then trigger a re-registration: `POST /api/v1/devices/:id/health-check` (which auto-reconfigures push on next capability check).
