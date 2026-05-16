/**
 * k6 baseline load test — Smart Access Middleware Platform
 *
 * Usage:
 *   k6 run --env BASE_URL=https://api.your-platform.com \
 *           --env ADMIN_TOKEN=<jwt> \
 *           --env DEVICE_ID=<uuid> \
 *           tests/load/k6-baseline.js
 *
 * Targets (from docs/01-architecture-overview.md §6):
 *   - API p95 latency (non-device) < 200 ms
 *   - Event receiver p95 < 100 ms
 *   - Sync engine ≥ 200 jobs/sec/worker
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const receiverLatency = new Trend('receiver_latency');
const apiLatency = new Trend('api_latency');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // ramp up
    { duration: '2m', target: 50 },    // sustained
    { duration: '30s', target: 200 },  // spike
    { duration: '1m', target: 200 },   // sustained spike
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    'http_req_duration{scenario:api}': ['p(95)<200'],
    'receiver_latency': ['p(95)<100'],
    'errors': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const RECEIVER_URL = __ENV.RECEIVER_URL || 'http://localhost:3001';
const TOKEN = __ENV.ADMIN_TOKEN || '';
const DEVICE_ID = __ENV.DEVICE_ID || '';
const DEVICE_TOKEN = __ENV.DEVICE_TOKEN || '';

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

export default function () {
  const scenario = Math.random();

  if (scenario < 0.3) {
    // ── Scenario 1: List devices (30%) ──
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/devices`, { headers, tags: { scenario: 'api' } });
    apiLatency.add(Date.now() - start);
    const ok = check(res, { 'devices 200': (r) => r.status === 200 });
    errorRate.add(!ok);

  } else if (scenario < 0.6) {
    // ── Scenario 2: List events (30%) ──
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/events?limit=20`, { headers, tags: { scenario: 'api' } });
    apiLatency.add(Date.now() - start);
    const ok = check(res, { 'events 200': (r) => r.status === 200 });
    errorRate.add(!ok);

  } else if (scenario < 0.9) {
    // ── Scenario 3: Receiver event push (30%) ──
    const start = Date.now();
    const xml = `<?xml version="1.0"?><EventNotificationAlert><eventType>cardPassed</eventType><employeeNoString>EMP${Math.floor(Math.random() * 1000)}</employeeNoString><doorNo>1</doorNo></EventNotificationAlert>`;
    const res = http.post(
      `${RECEIVER_URL}/hikvision/events?d=${DEVICE_ID}`,
      xml,
      {
        headers: { 'Content-Type': 'application/xml', 'X-Device-Token': DEVICE_TOKEN },
        tags: { scenario: 'receiver' },
      }
    );
    receiverLatency.add(Date.now() - start);
    const ok = check(res, { 'receiver 200': (r) => r.status === 200 });
    errorRate.add(!ok);

  } else {
    // ── Scenario 4: Health check (10%) ──
    const res = http.get(`${BASE_URL}/health`, { tags: { scenario: 'api' } });
    check(res, { 'health 200': (r) => r.status === 200 });
  }

  sleep(0.1);
}
