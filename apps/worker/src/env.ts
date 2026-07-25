import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal .env loader for dev — prod sets real environment variables.
 * Only sets keys that aren't already present (real env wins). Handles single-line
 * values (the signing key is stored as a one-line base64 DER blob).
 */
export function loadEnvFile(): void {
  const file = join(process.cwd(), '.env');
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
