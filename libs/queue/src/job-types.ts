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
