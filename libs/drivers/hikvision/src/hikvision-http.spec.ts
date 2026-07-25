import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock digest-fetch so no real network call happens; the mock lets each test
// dictate the raw body/status the "device" returns.
const fetchMock = vi.fn();
vi.mock('digest-fetch', () => ({
  default: class {
    fetch = fetchMock;
  },
}));

import { HikvisionHttp } from './hikvision-http';

function deviceResponse(body: string, status = 200) {
  return {
    status,
    text: () => Promise.resolve(body),
  };
}

const target = {
  id: 'dev-1',
  vendor: 'hikvision',
  ipAddress: '10.0.0.5',
  port: 80,
  username: 'admin',
  password: 'secret',
};

describe('HikvisionHttp response parsing', () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it('parses a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(deviceResponse('{"DeviceInfo":{"model":"DS-K1T343"}}'));
    const http = new HikvisionHttp(target);
    const res = await http.get<{ DeviceInfo: { model: string } }>('/ISAPI/System/deviceInfo');
    expect(res.DeviceInfo.model).toBe('DS-K1T343');
  });

  it('falls back to XML when firmware ignores ?format=json', async () => {
    // Real DS-K1T342 firmware answers XML regardless of the format hint.
    fetchMock.mockResolvedValueOnce(
      deviceResponse(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<DeviceInfo version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">' +
          '<model>DS-K1T342MFX-E1</model>' +
          '<serialNumber>DS-K1T342MFX-E120250912</serialNumber>' +
          '<firmwareVersion>V4.39.180</firmwareVersion>' +
          '</DeviceInfo>',
      ),
    );
    const http = new HikvisionHttp(target);
    const res = await http.get<{ DeviceInfo: { model: string; firmwareVersion: string } }>(
      '/ISAPI/System/deviceInfo?format=json',
    );
    expect(res.DeviceInfo.model).toBe('DS-K1T342MFX-E1');
    expect(res.DeviceInfo.firmwareVersion).toBe('V4.39.180');
  });

  it('returns an empty object for an empty 200 body', async () => {
    fetchMock.mockResolvedValueOnce(deviceResponse(''));
    const http = new HikvisionHttp(target);
    const res = await http.get('/ISAPI/AccessControl/RemoteControl/door/1');
    expect(res).toEqual({});
  });

  it('maps a 401 to an auth error', async () => {
    fetchMock.mockResolvedValueOnce(deviceResponse('', 401));
    const http = new HikvisionHttp(target);
    await expect(http.get('/ISAPI/System/deviceInfo')).rejects.toMatchObject({
      code: 'DRIVER_AUTH_FAILED',
    });
  });
});
