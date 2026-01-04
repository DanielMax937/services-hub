import { NextRequest } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function GET(
    request: NextRequest,
    context: RouteContext
): Promise<Response> {
    const { id } = await context.params;
    const manager = getServiceManager();

    // Check if service exists
    const service = manager.getService(id);
    if (!service) {
        return new Response(
            JSON.stringify({ error: `Service '${id}' not found` }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Create a readable stream for SSE
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();

            // Send initial connection message
            controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'connected', serviceId: id })}\n\n`)
            );

            // Send existing logs (history)
            const existingLogs = manager.getLogs(id);
            for (const entry of existingLogs) {
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'log', ...entry })}\n\n`)
                );
            }

            // Subscribe to new logs
            const unsubscribe = manager.subscribeToLogs(id, (entry) => {
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'log', ...entry })}\n\n`)
                    );
                } catch {
                    // Stream closed
                    unsubscribe();
                }
            });

            // Subscribe to status changes
            const statusHandler = (event: { id: string; status: string; pid?: number; error?: string }) => {
                if (event.id === id) {
                    try {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({ type: 'status', ...event })}\n\n`)
                        );
                    } catch {
                        // Stream closed
                    }
                }
            };
            manager.on('status', statusHandler);

            // Keep-alive ping every 30 seconds
            const pingInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(`: ping\n\n`));
                } catch {
                    clearInterval(pingInterval);
                }
            }, 30000);

            // Cleanup on abort
            request.signal.addEventListener('abort', () => {
                unsubscribe();
                manager.off('status', statusHandler);
                clearInterval(pingInterval);
                controller.close();
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
    });
}
