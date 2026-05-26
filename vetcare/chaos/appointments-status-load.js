import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const p95Latency = new Trend('p95_latency');

const requestedRps = Number(__ENV.RPS || 120);
const safeRps = Number.isFinite(requestedRps) ? Math.max(1, Math.min(requestedRps, 1000)) : 120;

export const options = {
  scenarios: {
    controlled_load: {
      executor: 'constant-arrival-rate',
      rate: safeRps,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 80,
      maxVUs: 200
    }
  },
  gracefulStop: '5s',
  thresholds: {
    errors: ['rate<0.05'],
    http_req_duration: ['p(95)<2000', 'max<5000']
  },
  ext: {
    loadimpact: {
      projectID: 0,
      name: 'vetcare-appointments-status-chaos-load'
    }
  }
};

const baseUrl = __ENV.BASE_URL || '';
const token = __ENV.ADMIN_BEARER_TOKEN || '';
const appointmentId = __ENV.APPOINTMENT_ID || '';

if (!baseUrl || !token || !appointmentId) {
  throw new Error('Set BASE_URL, ADMIN_BEARER_TOKEN, and APPOINTMENT_ID before running this script.');
}

export function setup() {
  return { shouldCleanup: Boolean(__ENV.CLEANUP_ENDPOINT) };
}

export default function () {
  const payload = JSON.stringify({
    appointmentId,
    action: Math.random() > 0.3 ? 'accept' : 'deny',
    reason: 'Chaos load validation - bounded run'
  });

  const res = http.post(`${baseUrl}/appointments-status`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: '5s'
  });

  const ok = check(res, {
    'status is bounded': (r) => [200, 400, 401, 403, 404].includes(r.status),
    'json body': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json')
  });

  errorRate.add(!ok);
  p95Latency.add(res.timings.duration);
  sleep(0.075);
}

export function teardown(data) {
  if (!data?.shouldCleanup || !__ENV.CLEANUP_ENDPOINT) {
    return;
  }

  http.post(__ENV.CLEANUP_ENDPOINT, JSON.stringify({ appointmentId }), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: '5s'
  });
}
