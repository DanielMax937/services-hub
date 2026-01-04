/**
 * Service definition as stored in services.json
 */
export interface ServiceConfig {
  id: string;
  name: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
  autoStart?: boolean;
  description?: string;
}

/**
 * Service status states
 */
export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * Runtime information for a service including its config and current status
 */
export interface ServiceInfo {
  config: ServiceConfig;
  status: ServiceStatus;
  pid?: number;
  startedAt?: string;
  error?: string;
}

/**
 * Log entry with timestamp
 */
export interface LogEntry {
  timestamp: string;
  data: string;
  stream: 'stdout' | 'stderr';
}

/**
 * Configuration file schema
 */
export interface ServicesConfigFile {
  services: ServiceConfig[];
}

/**
 * API response types
 */
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ServiceListResponse {
  services: ServiceInfo[];
}

export interface ServiceActionResponse {
  service: ServiceInfo;
  message: string;
}
