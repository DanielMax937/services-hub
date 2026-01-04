import { NextResponse } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';
import type { ApiResponse, ServiceListResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<ApiResponse<ServiceListResponse>>> {
    try {
        const manager = getServiceManager();
        const services = manager.getAllServices();

        return NextResponse.json({
            success: true,
            data: { services },
        });
    } catch (error) {
        console.error('[API] Failed to get services:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
