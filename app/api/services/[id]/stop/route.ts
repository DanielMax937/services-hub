import { NextRequest, NextResponse } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';
import type { ApiResponse, ServiceActionResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function POST(
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse<ApiResponse<ServiceActionResponse>>> {
    try {
        const { id } = await context.params;
        const manager = getServiceManager();
        const service = await manager.stopService(id);

        return NextResponse.json({
            success: true,
            data: {
                service,
                message: `Service '${id}' stopped`,
            },
        });
    } catch (error) {
        console.error('[API] Failed to stop service:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 400 }
        );
    }
}
