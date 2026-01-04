import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Format a duration in milliseconds to a human readable string
 */
export function formatUptime(startedAt: string | undefined): string {
    if (!startedAt) return '';

    const start = new Date(startedAt).getTime();
    const now = Date.now();
    const diff = now - start;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

/**
 * Get status color for badges
 */
export function getStatusColor(status: string): string {
    switch (status) {
        case 'running':
            return 'bg-green-500/20 text-green-500 border-green-500/30';
        case 'starting':
            return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
        case 'stopping':
            return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
        case 'error':
            return 'bg-red-500/20 text-red-500 border-red-500/30';
        case 'stopped':
        default:
            return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
}

/**
 * Get status icon name
 */
export function getStatusIcon(status: string): 'circle' | 'loader' | 'circle-x' | 'circle-pause' {
    switch (status) {
        case 'running':
            return 'circle';
        case 'starting':
        case 'stopping':
            return 'loader';
        case 'error':
            return 'circle-x';
        default:
            return 'circle-pause';
    }
}
