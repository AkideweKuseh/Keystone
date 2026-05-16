import { XMLParser } from 'fast-xml-parser';

export interface ParsedEvent {
  employeeNo?: string;
  doorIndex?: number;
  eventType?: string;
  eventSubtype?: string;
  eventTime?: Date;
}

// XXE-hardened XML parser: no external entities, no DTD processing
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
  allowBooleanAttributes: true,
  // fast-xml-parser does not load external entities by design (safe default)
});

export function parseEventPayload(raw: { contentType: string; body: string }): ParsedEvent {
  const ct = raw.contentType?.toLowerCase() ?? '';
  const body = raw.body ?? '';

  if (ct.includes('xml')) {
    return parseXml(body);
  }

  try {
    return parseJson(JSON.parse(body) as Record<string, unknown>);
  } catch {
    return {};
  }
}

function parseXml(body: string): ParsedEvent {
  try {
    const doc = xmlParser.parse(body) as Record<string, unknown>;
    // Hikvision wraps in <EventNotificationAlert> or <AccessControllerEvent>
    const root =
      (doc['EventNotificationAlert'] as Record<string, unknown>) ??
      (doc['AccessControllerEvent'] as Record<string, unknown>) ??
      doc;
    return {
      employeeNo: root['employeeNoString'] ? String(root['employeeNoString']) : undefined,
      doorIndex: typeof root['doorNo'] === 'number' ? root['doorNo'] : undefined,
      eventType: root['eventType'] ? String(root['eventType']) : undefined,
      eventSubtype: root['subEventType'] ? String(root['subEventType']) : undefined,
      eventTime: root['dateTime'] ? new Date(String(root['dateTime'])) : undefined,
    };
  } catch {
    return {};
  }
}

function parseJson(doc: Record<string, unknown>): ParsedEvent {
  const root = (doc['AccessControllerEvent'] as Record<string, unknown>) ?? doc;
  return {
    employeeNo: root['employeeNoString'] ? String(root['employeeNoString']) : undefined,
    doorIndex: typeof root['doorNo'] === 'number' ? root['doorNo'] : undefined,
    eventType: root['eventType'] ? String(root['eventType']) : undefined,
    eventSubtype: root['subEventType'] ? String(root['subEventType']) : undefined,
    eventTime: root['dateTime'] ? new Date(String(root['dateTime'])) : undefined,
  };
}

const GRANTED_TYPES = new Set(['cardPassed', '1', 'access_granted']);
const DENIED_TYPES = new Set(['cardNotPassed', '2', 'access_denied', 'noRight']);
const TAMPER_TYPES = new Set(['tamper', 'tamperDetected', '119']);

export function classifyEvent(parsed: ParsedEvent): string {
  const t = parsed.eventType?.toLowerCase() ?? '';
  if (GRANTED_TYPES.has(t)) return 'access_granted';
  if (DENIED_TYPES.has(t)) return 'access_denied';
  if (TAMPER_TYPES.has(t)) return 'tamper';
  if (t.includes('dooropen')) return 'door_opened';
  if (t.includes('doorclose')) return 'door_closed';
  if (t.includes('held')) return 'door_held_open';
  if (t.includes('forced') || t.includes('breakin')) return 'forced_entry';
  return t || 'unknown';
}
