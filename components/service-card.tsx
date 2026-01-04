'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Play,
    Square,
    RotateCcw,
    Terminal,
    Loader2,
    Circle,
    CircleX,
    CirclePause
} from 'lucide-react';
import { cn, formatUptime, getStatusColor } from '@/lib/utils';
import type { ServiceInfo } from '@/lib/types';

interface ServiceCardProps {
    service: ServiceInfo;
    onRefresh?: () => void;
}

export function ServiceCard({ service, onRefresh }: ServiceCardProps) {
    const [loading, setLoading] = useState<'start' | 'stop' | 'restart' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isRunning = service.status === 'running';
    const isStopped = service.status === 'stopped' || service.status === 'error';
    const isTransitioning = service.status === 'starting' || service.status === 'stopping';

    const handleAction = async (action: 'start' | 'stop' | 'restart') => {
        setLoading(action);
        setError(null);

        try {
            const response = await fetch(`/api/services/${service.config.id}/${action}`, {
                method: 'POST',
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Action failed');
            }

            onRefresh?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setLoading(null);
        }
    };

    const getStatusIcon = () => {
        if (loading || isTransitioning) {
            return <Loader2 className="h-3 w-3 animate-spin" />;
        }
        switch (service.status) {
            case 'running':
                return <Circle className="h-3 w-3 fill-current" />;
            case 'error':
                return <CircleX className="h-3 w-3" />;
            default:
                return <CirclePause className="h-3 w-3" />;
        }
    };

    return (
        <Card className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-lg text-zinc-100">
                            {service.config.name}
                        </CardTitle>
                        <CardDescription className="text-zinc-400">
                            {service.config.description || service.config.command}
                        </CardDescription>
                    </div>
                    <Badge
                        variant="outline"
                        className={cn('flex items-center gap-1.5', getStatusColor(service.status))}
                    >
                        {getStatusIcon()}
                        <span className="capitalize">{loading || service.status}</span>
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Service info */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-zinc-500">Command</div>
                    <div className="text-zinc-300 font-mono text-xs truncate" title={service.config.command}>
                        {service.config.command}
                    </div>

                    <div className="text-zinc-500">Directory</div>
                    <div className="text-zinc-300 font-mono text-xs truncate" title={service.config.cwd}>
                        {service.config.cwd}
                    </div>

                    {service.pid && (
                        <>
                            <div className="text-zinc-500">PID</div>
                            <div className="text-zinc-300 font-mono text-xs">{service.pid}</div>
                        </>
                    )}

                    {service.startedAt && (
                        <>
                            <div className="text-zinc-500">Uptime</div>
                            <div className="text-zinc-300 text-xs">{formatUptime(service.startedAt)}</div>
                        </>
                    )}
                </div>

                {/* Error display */}
                {(error || service.error) && (
                    <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error || service.error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                    {isStopped ? (
                        <Button
                            size="sm"
                            onClick={() => handleAction('start')}
                            disabled={!!loading}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {loading === 'start' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Play className="h-4 w-4 mr-1" />
                            )}
                            Start
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction('stop')}
                            disabled={!!loading || isTransitioning}
                        >
                            {loading === 'stop' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Square className="h-4 w-4 mr-1" />
                            )}
                            Stop
                        </Button>
                    )}

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction('restart')}
                        disabled={!!loading || isStopped}
                        className="border-zinc-700 hover:bg-zinc-800"
                    >
                        {loading === 'restart' ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                            <RotateCcw className="h-4 w-4 mr-1" />
                        )}
                        Restart
                    </Button>

                    <Link href={`/services/${service.config.id}`} className="ml-auto">
                        <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-zinc-100">
                            <Terminal className="h-4 w-4 mr-1" />
                            Logs
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
