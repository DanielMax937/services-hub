'use client';

import { useEffect, useState, useCallback } from 'react';
import { ServiceCard } from './service-card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, ServerOff } from 'lucide-react';
import type { ServiceInfo } from '@/lib/types';

interface ServiceListProps {
    initialServices?: ServiceInfo[];
}

export function ServiceList({ initialServices = [] }: ServiceListProps) {
    const [services, setServices] = useState<ServiceInfo[]>(initialServices);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchServices = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/services');
            const data = await response.json();

            if (data.success) {
                setServices(data.data.services);
            } else {
                setError(data.error || 'Failed to fetch services');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-refresh every 5 seconds
    useEffect(() => {
        fetchServices();
        const interval = setInterval(fetchServices, 5000);
        return () => clearInterval(interval);
    }, [fetchServices]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-zinc-100">Services</h2>
                    <p className="text-sm text-zinc-400">
                        {services.length} service{services.length !== 1 ? 's' : ''} configured
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchServices}
                    disabled={loading}
                    className="border-zinc-700 hover:bg-zinc-800"
                >
                    {loading ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Refresh
                </Button>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                    {error}
                </div>
            )}

            {/* Services grid */}
            {services.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {services.map((service) => (
                        <ServiceCard
                            key={service.config.id}
                            service={service}
                            onRefresh={fetchServices}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                    <ServerOff className="h-12 w-12 mb-4" />
                    <p className="text-lg font-medium">No services configured</p>
                    <p className="text-sm mt-1">
                        Add services to <code className="text-zinc-400">services.json</code> to get started
                    </p>
                </div>
            )}
        </div>
    );
}
