'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ArrowLeft,
    Play,
    Square,
    RotateCcw,
    Loader2,
    Circle,
    CircleX,
    CirclePause,
    Trash2
} from 'lucide-react';
import { cn, formatUptime, getStatusColor } from '@/lib/utils';
import type { ServiceInfo } from '@/lib/types';

// Dynamic import for xterm.js (requires browser APIs)
const TerminalView = dynamic(
    () => import('@/components/terminal-view').then((mod) => mod.TerminalView),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-[500px] bg-zinc-950 rounded-lg flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
            </div>
        ),
    }
);

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ServiceDetailPage({ params }: PageProps) {
    const { id } = use(params);
    const [service, setService] = useState<ServiceInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<'start' | 'stop' | 'restart' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchService = useCallback(async () => {
        try {
            const response = await fetch('/api/services');
            const data = await response.json();

            if (data.success) {
                const found = data.data.services.find((s: ServiceInfo) => s.config.id === id);
                if (found) {
                    setService(found);
                    setError(null);
                } else {
                    setError(`Service '${id}' not found`);
                }
            } else {
                setError(data.error || 'Failed to fetch service');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchService();
        const interval = setInterval(fetchService, 3000);
        return () => clearInterval(interval);
    }, [fetchService]);

    const handleAction = async (action: 'start' | 'stop' | 'restart') => {
        setActionLoading(action);
        setError(null);

        try {
            const response = await fetch(`/api/services/${id}/${action}`, {
                method: 'POST',
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Action failed');
            }

            await fetchService();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusIcon = () => {
        if (actionLoading || service?.status === 'starting' || service?.status === 'stopping') {
            return <Loader2 className="h-3 w-3 animate-spin" />;
        }
        switch (service?.status) {
            case 'running':
                return <Circle className="h-3 w-3 fill-current" />;
            case 'error':
                return <CircleX className="h-3 w-3" />;
            default:
                return <CirclePause className="h-3 w-3" />;
        }
    };

    const isRunning = service?.status === 'running';
    const isStopped = service?.status === 'stopped' || service?.status === 'error';
    const isTransitioning = service?.status === 'starting' || service?.status === 'stopping';

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
            </div>
        );
    }

    if (!service) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <p className="text-zinc-400">{error || `Service '${id}' not found`}</p>
                <Link href="/">
                    <Button variant="outline">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Dashboard
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/">
                                <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100">
                                    <ArrowLeft className="h-4 w-4 mr-1" />
                                    Back
                                </Button>
                            </Link>
                            <div className="h-6 w-px bg-zinc-700" />
                            <div>
                                <h1 className="text-lg font-semibold text-zinc-100">
                                    {service.config.name}
                                </h1>
                                <p className="text-xs text-zinc-500 font-mono">
                                    {service.config.command}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge
                                variant="outline"
                                className={cn('flex items-center gap-1.5', getStatusColor(service.status))}
                            >
                                {getStatusIcon()}
                                <span className="capitalize">{actionLoading || service.status}</span>
                            </Badge>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="flex-1 container mx-auto px-4 py-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                    {/* Terminal */}
                    <Card className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm text-zinc-400 font-medium">
                                    Output
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-zinc-500 hover:text-zinc-300"
                                    onClick={() => window.location.reload()}
                                >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Clear
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="h-[500px] p-2">
                                <TerminalView serviceId={id} className="h-full" />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        {/* Actions */}
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-zinc-400 font-medium">
                                    Actions
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {isStopped ? (
                                    <Button
                                        className="w-full bg-green-600 hover:bg-green-700"
                                        onClick={() => handleAction('start')}
                                        disabled={!!actionLoading}
                                    >
                                        {actionLoading === 'start' ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Play className="h-4 w-4 mr-2" />
                                        )}
                                        Start Service
                                    </Button>
                                ) : (
                                    <Button
                                        variant="destructive"
                                        className="w-full"
                                        onClick={() => handleAction('stop')}
                                        disabled={!!actionLoading || isTransitioning}
                                    >
                                        {actionLoading === 'stop' ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <Square className="h-4 w-4 mr-2" />
                                        )}
                                        Stop Service
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    className="w-full border-zinc-700 hover:bg-zinc-800"
                                    onClick={() => handleAction('restart')}
                                    disabled={!!actionLoading || isStopped}
                                >
                                    {actionLoading === 'restart' ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                    )}
                                    Restart Service
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Info */}
                        <Card className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm text-zinc-400 font-medium">
                                    Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <dl className="space-y-3 text-sm">
                                    <div>
                                        <dt className="text-zinc-500">ID</dt>
                                        <dd className="text-zinc-300 font-mono text-xs mt-0.5">{service.config.id}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-zinc-500">Command</dt>
                                        <dd className="text-zinc-300 font-mono text-xs mt-0.5 break-all">
                                            {service.config.command}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-zinc-500">Working Directory</dt>
                                        <dd className="text-zinc-300 font-mono text-xs mt-0.5 break-all">
                                            {service.config.cwd}
                                        </dd>
                                    </div>
                                    {service.pid && (
                                        <div>
                                            <dt className="text-zinc-500">Process ID</dt>
                                            <dd className="text-zinc-300 font-mono text-xs mt-0.5">{service.pid}</dd>
                                        </div>
                                    )}
                                    {service.startedAt && (
                                        <div>
                                            <dt className="text-zinc-500">Uptime</dt>
                                            <dd className="text-zinc-300 text-xs mt-0.5">
                                                {formatUptime(service.startedAt)}
                                            </dd>
                                        </div>
                                    )}
                                    {service.config.env && Object.keys(service.config.env).length > 0 && (
                                        <div>
                                            <dt className="text-zinc-500">Environment</dt>
                                            <dd className="text-zinc-300 font-mono text-xs mt-0.5">
                                                {Object.entries(service.config.env).map(([k, v]) => (
                                                    <div key={k}>{k}={v}</div>
                                                ))}
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </CardContent>
                        </Card>

                        {/* Error display */}
                        {(error || service.error) && (
                            <Card className="bg-red-500/10 border-red-500/20">
                                <CardContent className="pt-4">
                                    <p className="text-red-400 text-sm">{error || service.error}</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
