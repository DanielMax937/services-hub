'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
    serviceId: string;
    className?: string;
}

export function TerminalView({ serviceId, className = '' }: TerminalViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const connectToLogs = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource(`/api/services/${serviceId}/logs`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'log' && terminalRef.current) {
                    // Write raw data - ANSI codes are already included
                    const lines = data.data.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i]) {
                            terminalRef.current.writeln(lines[i]);
                        } else if (i < lines.length - 1) {
                            // Empty line in the middle
                            terminalRef.current.writeln('');
                        }
                    }
                } else if (data.type === 'status') {
                    // Show status changes in terminal
                    const statusColors: Record<string, string> = {
                        running: '\x1b[92m', // green
                        stopped: '\x1b[90m', // dim
                        error: '\x1b[91m', // red
                        starting: '\x1b[93m', // yellow
                        stopping: '\x1b[93m', // yellow
                    };
                    const color = statusColors[data.status] || '\x1b[0m';
                    terminalRef.current?.writeln(
                        `${color}[STATUS] Service ${data.status}${data.pid ? ` (PID: ${data.pid})` : ''}\x1b[0m`
                    );
                } else if (data.type === 'connected') {
                    terminalRef.current?.writeln('\x1b[90m[Connected to log stream]\x1b[0m');
                }
            } catch (err) {
                console.error('Failed to parse SSE message:', err);
            }
        };

        eventSource.onerror = () => {
            // Attempt reconnection after a delay
            setTimeout(() => {
                if (eventSourceRef.current === eventSource) {
                    terminalRef.current?.writeln('\x1b[91m[Disconnected, reconnecting...]\x1b[0m');
                    connectToLogs();
                }
            }, 2000);
        };
    }, [serviceId]);

    useEffect(() => {
        if (!containerRef.current || terminalRef.current) return;

        // Create terminal instance
        const terminal = new Terminal({
            cursorBlink: false,
            cursorStyle: 'bar',
            disableStdin: true, // Read-only terminal for logs
            scrollback: 10000,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.2,
            theme: {
                background: '#09090b', // zinc-950
                foreground: '#fafafa', // zinc-50
                cursor: '#fafafa',
                selectionBackground: '#3f3f46', // zinc-700
                black: '#09090b',
                red: '#ef4444',
                green: '#22c55e',
                yellow: '#eab308',
                blue: '#3b82f6',
                magenta: '#a855f7',
                cyan: '#06b6d4',
                white: '#fafafa',
                brightBlack: '#71717a',
                brightRed: '#f87171',
                brightGreen: '#4ade80',
                brightYellow: '#facc15',
                brightBlue: '#60a5fa',
                brightMagenta: '#c084fc',
                brightCyan: '#22d3ee',
                brightWhite: '#ffffff',
            },
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);

        terminal.open(containerRef.current);
        fitAddon.fit();

        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
        });
        resizeObserver.observe(containerRef.current);

        // Connect to SSE stream
        connectToLogs();

        return () => {
            resizeObserver.disconnect();
            eventSourceRef.current?.close();
            terminal.dispose();
            terminalRef.current = null;
            fitAddonRef.current = null;
        };
    }, [connectToLogs]);

    // Reconnect when serviceId changes
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.clear();
            connectToLogs();
        }
    }, [serviceId, connectToLogs]);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full min-h-[300px] bg-zinc-950 rounded-lg overflow-hidden ${className}`}
        />
    );
}
