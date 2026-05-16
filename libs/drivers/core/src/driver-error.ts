export enum DriverErrorCode {
  Unreachable = 'DRIVER_UNREACHABLE',
  Timeout = 'DRIVER_TIMEOUT',
  AuthFailed = 'DRIVER_AUTH_FAILED',
  UnsupportedFeature = 'DRIVER_UNSUPPORTED_FEATURE',
  BadResponse = 'DRIVER_BAD_RESPONSE',
  RateLimited = 'DRIVER_RATE_LIMITED',
  Conflict = 'DRIVER_CONFLICT',
  Internal = 'DRIVER_INTERNAL',
}

const RETRYABLE = new Set<DriverErrorCode>([
  DriverErrorCode.Unreachable,
  DriverErrorCode.Timeout,
  DriverErrorCode.RateLimited,
]);

export class DriverError extends Error {
  constructor(
    public readonly code: DriverErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DriverError';
  }

  get isRetryable(): boolean {
    return RETRYABLE.has(this.code);
  }

  static unreachable(cause?: unknown): DriverError {
    return new DriverError(DriverErrorCode.Unreachable, 'Device unreachable', cause);
  }
  static timeout(cause?: unknown): DriverError {
    return new DriverError(DriverErrorCode.Timeout, 'Device request timed out', cause);
  }
  static authFailed(): DriverError {
    return new DriverError(DriverErrorCode.AuthFailed, 'Authentication failed');
  }
  static unsupported(feature: string): DriverError {
    return new DriverError(DriverErrorCode.UnsupportedFeature, `Unsupported: ${feature}`);
  }
  static badResponse(detail: string): DriverError {
    return new DriverError(DriverErrorCode.BadResponse, `Bad device response: ${detail}`);
  }
  static rateLimited(): DriverError {
    return new DriverError(DriverErrorCode.RateLimited, 'Device rate limited');
  }
  static conflict(): DriverError {
    return new DriverError(DriverErrorCode.Conflict, 'Conflict on device');
  }
  static internal(cause?: unknown): DriverError {
    return new DriverError(DriverErrorCode.Internal, 'Internal driver error', cause);
  }
}
