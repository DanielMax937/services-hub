import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import treeKill from 'tree-kill';
import type {
    ServiceConfig,
    ServiceStatus,
    ServiceInfo,
    ServicesConfigFile,
    LogEntry,
} from './types';

const MAX_LOG_ENTRIES = 10000;
const CONFIG_PATH = path.join(process.cwd(), 'services.json');

interface RunningService {
    config: ServiceConfig;
    process: ChildProcess;
    status: ServiceStatus;
    pid?: number;
    startedAt?: Date;
    error?: string;
    logBuffer: LogEntry[];
    subscribers: Set<(entry: LogEntry) => void>;
}

class ServiceManager extends EventEmitter {
    private services: Map<string, ServiceConfig> = new Map();
    private running: Map<string, RunningService> = new Map();
    private initialized = false;

    constructor() {
        super();
        this.setMaxListeners(100); // Allow many subscribers
    }

    /**
     * Load service definitions from services.json
     */
    loadServices(): void {
        if (this.initialized) return;

        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
                const config: ServicesConfigFile = JSON.parse(content);

                for (const service of config.services) {
                    this.services.set(service.id, service);
                }

                console.log(`[ServiceManager] Loaded ${this.services.size} services`);
            } else {
                console.log('[ServiceManager] No services.json found');
            }
        } catch (error) {
            console.error('[ServiceManager] Failed to load services:', error);
        }

        this.initialized = true;
    }

    /**
     * Reload services config (useful after changes)
     */
    reloadServices(): void {
        this.initialized = false;
        this.services.clear();
        this.loadServices();
    }

    /**
     * Get all services with their current status
     */
    getAllServices(): ServiceInfo[] {
        this.loadServices();

        const result: ServiceInfo[] = [];

        for (const [id, config] of this.services) {
            const running = this.running.get(id);

            result.push({
                config,
                status: running?.status ?? 'stopped',
                pid: running?.pid,
                startedAt: running?.startedAt?.toISOString(),
                error: running?.error,
            });
        }

        return result;
    }

    /**
     * Get a single service's info
     */
    getService(id: string): ServiceInfo | null {
        this.loadServices();

        const config = this.services.get(id);
        if (!config) return null;

        const running = this.running.get(id);

        return {
            config,
            status: running?.status ?? 'stopped',
            pid: running?.pid,
            startedAt: running?.startedAt?.toISOString(),
            error: running?.error,
        };
    }

    /**
     * Start a service
     */
    async startService(id: string): Promise<ServiceInfo> {
        this.loadServices();

        const config = this.services.get(id);
        if (!config) {
            throw new Error(`Service '${id}' not found`);
        }

        // Check if already running
        const existing = this.running.get(id);
        if (existing && (existing.status === 'running' || existing.status === 'starting')) {
            throw new Error(`Service '${id}' is already ${existing.status}`);
        }

        // Validate cwd exists
        if (!fs.existsSync(config.cwd)) {
            throw new Error(`Working directory '${config.cwd}' does not exist`);
        }

        // Build environment
        const env: Record<string, string> = {
            ...process.env as Record<string, string>,
            // Force unbuffered output for Python
            PYTHONUNBUFFERED: '1',
            // Force color output
            FORCE_COLOR: '1',
            TERM: 'xterm-256color',
            // Merge service-specific env
            ...config.env,
        };

        console.log(`[ServiceManager] Starting service '${id}': ${config.command}`);

        // Parse command - use shell to handle complex commands
        const child = spawn(config.command, [], {
            cwd: config.cwd,
            env,
            shell: true,
            // Pipe stdout and stderr
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const runningService: RunningService = {
            config,
            process: child,
            status: 'starting',
            pid: child.pid,
            startedAt: new Date(),
            logBuffer: [],
            subscribers: new Set(),
        };

        this.running.set(id, runningService);

        // Set encoding to preserve ANSI codes as strings
        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');

        // Handle stdout
        child.stdout?.on('data', (data: string) => {
            this.addLog(id, data, 'stdout');
        });

        // Handle stderr
        child.stderr?.on('data', (data: string) => {
            this.addLog(id, data, 'stderr');
        });

        // Handle process start
        child.on('spawn', () => {
            runningService.status = 'running';
            console.log(`[ServiceManager] Service '${id}' is now running (PID: ${child.pid})`);
            this.emit('status', { id, status: 'running', pid: child.pid });
        });

        // Handle process error
        child.on('error', (error) => {
            runningService.status = 'error';
            runningService.error = error.message;
            console.error(`[ServiceManager] Service '${id}' error:`, error.message);
            this.emit('status', { id, status: 'error', error: error.message });
        });

        // Handle process exit
        child.on('exit', (code, signal) => {
            const wasRunning = runningService.status === 'running';

            if (runningService.status !== 'stopping') {
                // Unexpected exit
                runningService.status = code === 0 ? 'stopped' : 'error';
                if (code !== 0) {
                    runningService.error = `Exited with code ${code}`;
                }
            } else {
                runningService.status = 'stopped';
            }

            console.log(`[ServiceManager] Service '${id}' exited (code: ${code}, signal: ${signal})`);
            this.emit('status', { id, status: runningService.status, code, signal });

            // Keep the running service info for a bit to show exit status
            // but mark it as stopped
        });

        return this.getService(id)!;
    }

    /**
     * Stop a service using tree-kill to terminate all child processes
     */
    async stopService(id: string): Promise<ServiceInfo> {
        const running = this.running.get(id);

        if (!running) {
            throw new Error(`Service '${id}' is not running`);
        }

        if (running.status === 'stopped' || running.status === 'stopping') {
            throw new Error(`Service '${id}' is already ${running.status}`);
        }

        if (!running.pid) {
            throw new Error(`Service '${id}' has no PID`);
        }

        running.status = 'stopping';
        console.log(`[ServiceManager] Stopping service '${id}' (PID: ${running.pid})`);

        return new Promise((resolve, reject) => {
            const pid = running.pid!;

            // First try SIGTERM
            treeKill(pid, 'SIGTERM', (err) => {
                if (err) {
                    console.warn(`[ServiceManager] SIGTERM failed for '${id}', trying SIGKILL`);
                    // Force kill if SIGTERM fails
                    treeKill(pid, 'SIGKILL', (killErr) => {
                        if (killErr) {
                            running.status = 'error';
                            running.error = `Failed to kill process: ${killErr.message}`;
                            reject(new Error(running.error));
                        } else {
                            running.status = 'stopped';
                            resolve(this.getService(id)!);
                        }
                    });
                } else {
                    running.status = 'stopped';
                    resolve(this.getService(id)!);
                }
            });

            // Force kill after timeout
            setTimeout(() => {
                if (running.status === 'stopping') {
                    console.warn(`[ServiceManager] Timeout stopping '${id}', forcing SIGKILL`);
                    treeKill(pid, 'SIGKILL', () => {
                        running.status = 'stopped';
                    });
                }
            }, 5000);
        });
    }

    /**
     * Restart a service
     */
    async restartService(id: string): Promise<ServiceInfo> {
        const running = this.running.get(id);

        if (running && running.status !== 'stopped' && running.status !== 'error') {
            await this.stopService(id);
            // Wait a bit for cleanup
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return this.startService(id);
    }

    /**
     * Get logs for a service
     */
    getLogs(id: string): LogEntry[] {
        const running = this.running.get(id);
        return running?.logBuffer ?? [];
    }

    /**
     * Subscribe to log updates
     */
    subscribeToLogs(id: string, callback: (entry: LogEntry) => void): () => void {
        const running = this.running.get(id);

        if (running) {
            running.subscribers.add(callback);
            return () => running.subscribers.delete(callback);
        }

        // Create a pending subscription for when the service starts
        const handler = (event: { id: string }) => {
            if (event.id === id) {
                const r = this.running.get(id);
                if (r) {
                    r.subscribers.add(callback);
                }
            }
        };

        this.on('status', handler);
        return () => {
            this.off('status', handler);
            const r = this.running.get(id);
            if (r) {
                r.subscribers.delete(callback);
            }
        };
    }

    /**
     * Add a log entry and notify subscribers (internal)
     */
    private addLog(id: string, data: string, stream: 'stdout' | 'stderr'): void {
        const running = this.running.get(id);
        if (!running) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            data,
            stream,
        };

        // Add to buffer with ring buffer behavior
        running.logBuffer.push(entry);
        if (running.logBuffer.length > MAX_LOG_ENTRIES) {
            running.logBuffer.shift();
        }

        // Notify subscribers
        for (const callback of running.subscribers) {
            try {
                callback(entry);
            } catch (err) {
                console.error('[ServiceManager] Subscriber error:', err);
            }
        }

        // Emit for SSE handlers
        this.emit('log', { id, entry });
    }

    /**
     * Cleanup on shutdown
     */
    async shutdown(): Promise<void> {
        console.log('[ServiceManager] Shutting down...');

        const stopPromises: Promise<unknown>[] = [];

        for (const [id, running] of this.running) {
            if (running.status === 'running' || running.status === 'starting') {
                stopPromises.push(
                    this.stopService(id).catch(err => {
                        console.error(`[ServiceManager] Failed to stop '${id}':`, err);
                    })
                );
            }
        }

        await Promise.all(stopPromises);
        console.log('[ServiceManager] Shutdown complete');
    }
}

// Global singleton to survive hot reloads
declare global {
    // eslint-disable-next-line no-var
    var __serviceManager: ServiceManager | undefined;
}

/**
 * Get the singleton ServiceManager instance
 */
export function getServiceManager(): ServiceManager {
    if (!global.__serviceManager) {
        global.__serviceManager = new ServiceManager();

        // Setup cleanup handlers
        if (typeof process !== 'undefined') {
            const cleanup = () => {
                global.__serviceManager?.shutdown();
            };

            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);
        }
    }

    return global.__serviceManager;
}

export { ServiceManager };
