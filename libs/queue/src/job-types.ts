export interface HealthCheckJobData {
  deviceId: string;
  tenantId: string;
}

export interface CapabilityDiscoveryJobData {
  deviceId: string;
  tenantId: string;
}

export interface UserSyncJobData {
  deviceId: string;
  tenantId: string;
  userId: string;
  desiredState: 'present' | 'absent';
  revision: number;
}

export interface EventProcessJobData {
  eventId: string;
  deviceId: string;
  tenantId: string;
}

export interface EventPollJobData {
  deviceId: string;
  tenantId: string;
  since: string; // ISO date string
}
