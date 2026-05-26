import http from 'k6/http';
import { check, sleep } from 'k6';

const requestedVus = Number(__ENV.VUS || 20);
const safeVus = Number.isFinite(requestedVus) ? Math.max(1, Math.min(requestedVus, 100)) : 20;

export const options = {
  vus: safeVus,
  duration: '45s',
  gracefulStop: '5s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000', 'max<5000']
  }
};

const baseUrl = __ENV.BASE_URL || '';
if (!baseUrl) {
  throw new Error('Set BASE_URL before running this script.');
}

function randomPayload() {
  const variants = [
    {
      full_name: 'Alice Vet',
      email: 'alice@example.com',
      pet_name: 'Milo',
      service_inquiry: 'General Wellness',
      message: 'Need a follow-up check in two days.'
    },
    {
      full_name: '<script>alert(1)</script>',
      email: 'bad-email-format',
      pet_name: '__proto__',
      service_inquiry: 'Diagnostics',
      message: 'x'.repeat(5000)
    },
    {
      full_name: 'Boundary Case',
      email: 'boundary@example.com',
      pet_name: '',
      service_inquiry: '',
      message: 'line1\nline2\nline3'
    },
    {
      full_name: 'Null Byte',
      email: 'nullbyte@example.com',
      pet_name: 'Pet\u0000Name',
      service_inquiry: 'General Wellness',
      message: '../../../../../etc/passwd'
    },
    {
      full_name: 'Unicode Stress',
      email: 'unicode@example.com',
      pet_name: '🐶🐾',
      service_inquiry: 'Diagnostics',
      message: 'مرحبا'.repeat(200)
    }
  ];

  return variants[Math.floor(Math.random() * variants.length)];
}

export default function () {
  const payload = JSON.stringify(randomPayload());
  const res = http.post(`${baseUrl}/contact-message-notify`, payload, {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: '5s'
  });

  check(res, {
    'returns bounded status': (r) => [200, 400, 401, 403, 429, 500, 502].includes(r.status),
    'response time bounded': (r) => r.timings.duration < 2500,
    'response body is present': (r) => typeof r.body === 'string'
  });

  sleep(0.12);
}
