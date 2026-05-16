# Runbook: Admin Account Lockout Storm

**Alert:** Multiple admin accounts locked out in short succession  
**Severity:** Critical (potential credential stuffing attack)

## Diagnosis

```sql
-- Count recent lockouts
SELECT email, failed_logins, locked_until
FROM admin_users
WHERE locked_until > NOW()
ORDER BY locked_until DESC;

-- Check audit log for failed login pattern
SELECT actor_id, ip_address, COUNT(*) AS attempts, MAX(created_at) AS last_attempt
FROM audit_log
WHERE action = 'auth.login.failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY actor_id, ip_address
ORDER BY attempts DESC
LIMIT 20;
```

## Response

**If credential stuffing (many IPs, many accounts):**

1. Immediately block attacking IP ranges at Nginx / cloud WAF level.
2. Reset all locked accounts that are legitimate:
   ```sql
   UPDATE admin_users SET failed_logins = 0, locked_until = NULL WHERE email = 'legit@example.com';
   ```
3. Force MFA re-enrollment for all accounts.
4. File incident report.

**If insider threat (single IP, specific accounts):**

1. Block the source IP.
2. Audit the account's recent actions via `audit_log`.
3. Escalate to security team.

## Recovery Verification

- No new lockouts in the 30 min following mitigation.
- Nginx rate-limit rules in place for `/api/v1/auth/login`.
