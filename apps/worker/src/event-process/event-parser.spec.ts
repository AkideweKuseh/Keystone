import { describe, it, expect } from 'vitest';
import { parseEventPayload, classifyEvent } from './event-parser';

const XML_GRANTED = `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0">
  <eventType>cardPassed</eventType>
  <employeeNoString>EMP001</employeeNoString>
  <doorNo>1</doorNo>
  <dateTime>2026-05-16T12:00:00</dateTime>
</EventNotificationAlert>`;

const XML_DENIED = `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0">
  <eventType>cardNotPassed</eventType>
  <employeeNoString>EMP002</employeeNoString>
  <doorNo>2</doorNo>
</EventNotificationAlert>`;

const JSON_TAMPER = JSON.stringify({
  AccessControllerEvent: {
    eventType: 'tamper',
    employeeNoString: '',
    doorNo: 1,
    dateTime: '2026-05-16T13:00:00',
  },
});

describe('parseEventPayload', () => {
  it('parses XML access_granted event', () => {
    const parsed = parseEventPayload({ contentType: 'application/xml', body: XML_GRANTED });
    expect(parsed.employeeNo).toBe('EMP001');
    expect(parsed.doorIndex).toBe(1);
    expect(parsed.eventType).toBe('cardPassed');
    expect(parsed.eventTime).toBeInstanceOf(Date);
  });

  it('parses XML access_denied event', () => {
    const parsed = parseEventPayload({ contentType: 'application/xml', body: XML_DENIED });
    expect(parsed.employeeNo).toBe('EMP002');
    expect(parsed.doorIndex).toBe(2);
  });

  it('parses JSON tamper event', () => {
    const parsed = parseEventPayload({ contentType: 'application/json', body: JSON_TAMPER });
    expect(parsed.eventType).toBe('tamper');
  });

  it('returns empty object for malformed body', () => {
    const parsed = parseEventPayload({ contentType: 'application/json', body: '{invalid' });
    expect(parsed).toEqual({});
  });
});

describe('classifyEvent', () => {
  it('classifies cardPassed as access_granted', () => {
    expect(classifyEvent({ eventType: 'cardPassed' })).toBe('access_granted');
  });

  it('classifies cardNotPassed as access_denied', () => {
    expect(classifyEvent({ eventType: 'cardNotPassed' })).toBe('access_denied');
  });

  it('classifies tamper', () => {
    expect(classifyEvent({ eventType: 'tamper' })).toBe('tamper');
  });

  it('classifies unknown types with lowercase name', () => {
    expect(classifyEvent({ eventType: 'someOtherEvent' })).toBe('someotherevent');
  });

  it('handles missing eventType', () => {
    expect(classifyEvent({})).toBe('unknown');
  });
});
