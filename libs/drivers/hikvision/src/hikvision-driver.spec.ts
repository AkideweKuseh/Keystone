import { afterEach, describe, expect, it, vi } from 'vitest';

// Capture the raw request the driver makes so we can assert URL/method/body.
const fetchMock = vi.fn();
vi.mock('digest-fetch', () => ({
  default: class {
    fetch = fetchMock;
  },
}));

import { HikvisionDriver } from './hikvision-driver';

function ok(body = '{}') {
  return { status: 200, text: () => Promise.resolve(body) };
}

const target = {
  id: 'dev-1',
  vendor: 'hikvision',
  ipAddress: '10.0.0.5',
  port: 80,
  username: 'admin',
  password: 'secret',
};

function lastCall(): { url: string; init: { method: string; body?: string } } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, { method: string; body?: string }];
  return { url, init };
}

describe('HikvisionDriver.setValidity', () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it('disables via UserInfo/Modify with enable=false and a past endTime', async () => {
    fetchMock.mockResolvedValue(ok());
    await new HikvisionDriver(target).setValidity('EMP42', false);

    const { url, init } = lastCall();
    expect(url).toContain('/ISAPI/AccessControl/UserInfo/Modify');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body ?? '{}') as {
      UserInfo: { employeeNo: string; Valid: { enable: boolean; endTime: string } };
    };
    expect(body.UserInfo.employeeNo).toBe('EMP42');
    expect(body.UserInfo.Valid.enable).toBe(false);
    // Past endTime so firmwares honouring only the window still expire the user.
    expect(new Date(body.UserInfo.Valid.endTime).getTime()).toBeLessThan(Date.now());
  });

  it('re-enables with enable=true and the supplied endTime', async () => {
    fetchMock.mockResolvedValue(ok());
    await new HikvisionDriver(target).setValidity('EMP42', true, '2027-06-30T00:00:00');

    const body = JSON.parse(lastCall().init.body ?? '{}') as {
      UserInfo: { Valid: { enable: boolean; endTime: string } };
    };
    expect(body.UserInfo.Valid.enable).toBe(true);
    expect(body.UserInfo.Valid.endTime).toBe('2027-06-30T00:00:00');
  });

  it('does not call deleteUser when disabling', async () => {
    fetchMock.mockResolvedValue(ok());
    await new HikvisionDriver(target).setValidity('EMP42', false);
    const urls = (fetchMock.mock.calls as [string][]).map((c) => c[0]);
    expect(urls.some((u) => u.includes('/Delete'))).toBe(false);
  });
});
