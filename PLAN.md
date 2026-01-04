# Local Dev Ops Dashboard - Technical Plan

## Overview

A Next.js web application to manage local development services (Python/Node.js) via a web GUI with real-time terminal output.

---

## Architecture Decisions

### 1. Process State Persistence (Hot-Reload Survival)

**Problem:** During Next.js development, hot module replacement (HMR) reloads modules, which would destroy any process references stored in module scope.

**Solution: Global Singleton Pattern**

```typescript
// lib/process-manager.ts
declare global {
  var __processManager: ServiceManager | undefined;
}

export function getProcessManager(): ServiceManager {
  if (!global.__processManager) {
    global.__processManager = new ServiceManager();
  }
  return global.__processManager;
}
```

This leverages the fact that `globalThis` (accessed via `global` in Node.js) survives hot-reloads. The double-underscore prefix is a convention to avoid conflicts.

---

### 2. Real-Time Communication Strategy

**Choice: Server-Sent Events (SSE) + REST API**

| Consideration | Socket.io | SSE + REST | Polling |
|--------------|-----------|------------|---------|
| Complexity | High (WebSocket server setup) | Medium | Low |
| Real-time logs | ✅ Excellent | ✅ Excellent | ❌ Laggy |
| Next.js compatibility | ⚠️ Requires custom server | ✅ Native Route Handlers | ✅ Native |
| Browser support | ✅ | ✅ | ✅ |
| Bidirectional | ✅ | ❌ (but not needed) | ❌ |

**Justification:** We don't need bidirectional communication - logs flow one-way (server → client), and commands (start/stop) are simple HTTP requests. SSE provides:
- Native Next.js Route Handler support (no custom server)
- Automatic reconnection
- Lower overhead than WebSockets
- Simpler implementation

**Implementation:**
- `POST /api/services/:id/start` - Start a service
- `POST /api/services/:id/stop` - Stop a service  
- `POST /api/services/:id/restart` - Restart a service
- `GET /api/services` - List all services with status
- `GET /api/services/:id/logs` - SSE stream for real-time logs

---

### 3. Output Buffering & ANSI Preservation

**Problem:** 
- Python buffers stdout by default, causing logs to appear in batches
- ANSI escape codes must be preserved for xterm.js to render colors

**Solution:**

```typescript
// When spawning Python processes:
const env = {
  ...process.env,
  PYTHONUNBUFFERED: '1',        // Disable Python output buffering
  FORCE_COLOR: '1',             // Force color output in some tools
  TERM: 'xterm-256color',       // Tell apps we support colors
};

const child = spawn(command, args, {
  cwd: service.cwd,
  env,
  shell: true,                  // Required for command chaining
});

// Capture as strings, NOT parsed - preserves ANSI codes
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');

child.stdout.on('data', (data: string) => {
  // Store raw string including ANSI escape sequences
  service.logBuffer.push(data);
  service.emit('log', data);
});
```

**Log Buffer Design:**
- Store last 10,000 lines per service (configurable)
- Ring buffer pattern to prevent memory leaks
- Raw strings with ANSI codes intact

---

### 4. Process Tree Termination

**Problem:** Commands like `pnpm dev` create process trees:
```
pnpm (PID 1234)
  └── node (PID 1235)
        └── next dev (PID 1236)
```

Killing PID 1234 orphans the children.

**Solution: Use `tree-kill` library**

```typescript
import treeKill from 'tree-kill';

async function stopService(serviceId: string): Promise<void> {
  const process = activeProcesses.get(serviceId);
  if (!process?.pid) return;

  return new Promise((resolve, reject) => {
    treeKill(process.pid, 'SIGTERM', (err) => {
      if (err) {
        // Force kill if SIGTERM fails
        treeKill(process.pid, 'SIGKILL', resolve);
      } else {
        resolve();
      }
    });
  });
}
```

**Verification:** After stopping, we'll verify no orphan processes remain using `pgrep` or `ps` checks.

---

### 5. Service Configuration Schema

**File: `services.json`**

```json
{
  "services": [
    {
      "id": "api-server",
      "name": "API Server",
      "command": "uv run main.py",
      "cwd": "/path/to/api",
      "env": {
        "PORT": "8000"
      },
      "autoStart": false
    },
    {
      "id": "web-app",
      "name": "Web App",
      "command": "pnpm dev",
      "cwd": "/path/to/web",
      "env": {
        "PORT": "3001"
      },
      "autoStart": false
    }
  ]
}
```

---

## Project Structure

```
services-hub/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Dashboard
│   ├── services/
│   │   └── [id]/
│   │       └── page.tsx            # Service detail with terminal
│   └── api/
│       └── services/
│           ├── route.ts            # GET all services
│           └── [id]/
│               ├── start/route.ts  # POST start
│               ├── stop/route.ts   # POST stop
│               ├── restart/route.ts # POST restart
│               └── logs/route.ts   # GET SSE stream
├── components/
│   ├── ui/                         # Shadcn components
│   ├── service-card.tsx
│   ├── service-list.tsx
│   └── terminal-view.tsx           # xterm.js wrapper
├── lib/
│   ├── service-manager.ts          # Core process management
│   ├── types.ts                    # TypeScript interfaces
│   └── utils.ts
├── services.json                   # Service definitions
├── test_service.py                 # Test script for verification
└── package.json
```

---

## Component Design

### ServiceManager Class

```typescript
interface Service {
  id: string;
  name: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
  autoStart?: boolean;
}

interface RunningService {
  service: Service;
  process: ChildProcess;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  logBuffer: string[];
  subscribers: Set<(log: string) => void>;
}

class ServiceManager extends EventEmitter {
  private services: Map<string, Service>;
  private running: Map<string, RunningService>;
  
  loadServices(configPath: string): void;
  startService(id: string): Promise<void>;
  stopService(id: string): Promise<void>;
  restartService(id: string): Promise<void>;
  getStatus(id: string): ServiceStatus;
  subscribeToLogs(id: string, callback: LogCallback): Unsubscribe;
}
```

### Terminal Component (xterm.js)

```typescript
// components/terminal-view.tsx
'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalViewProps {
  serviceId: string;
}
```

Key features:
- Auto-resize with `FitAddon`
- Scrollback buffer of 10,000 lines
- Support for 256 colors
- WebLinks addon for clickable URLs

---

## Dependencies

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "xterm-addon-web-links": "^0.9.0",
    "tree-kill": "^1.2.2",
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "typescript": "^5.0.0"
  }
}
```

---

## Implementation Phases

### Phase 1: Scaffold & Core (Step 2)
1. Initialize Next.js with TypeScript, Tailwind, App Router
2. Install Shadcn/UI components (button, card, badge, etc.)
3. Implement `ServiceManager` class with all core logic
4. Create API routes for service control
5. Create `services.json` with test services

### Phase 2: Frontend (Step 3)
1. Build dashboard with service cards showing status
2. Implement start/stop/restart buttons with loading states
3. Create terminal view with xterm.js
4. Connect SSE for real-time log streaming
5. Add responsive design and polish

### Phase 3: Test & Verify (Step 4)
1. Create `test_service.py` with colored output
2. Add test service to `services.json`
3. Verify:
   - Immediate log streaming (PYTHONUNBUFFERED works)
   - ANSI colors render correctly
   - Tree-kill properly terminates all child processes
   - Service state persists across hot-reloads

---

## Test Script Design

```python
# test_service.py
import time
import sys

COLORS = {
    'red': '\033[91m',
    'green': '\033[92m',
    'yellow': '\033[93m',
    'blue': '\033[94m',
    'magenta': '\033[95m',
    'cyan': '\033[96m',
    'reset': '\033[0m'
}

def main():
    print(f"{COLORS['green']}🚀 Service started!{COLORS['reset']}")
    counter = 0
    colors = list(COLORS.keys())[:-1]  # Exclude 'reset'
    
    while True:
        color = colors[counter % len(colors)]
        print(f"{COLORS[color]}[{counter:04d}] Heartbeat...{COLORS['reset']}")
        sys.stdout.flush()  # Explicit flush for safety
        counter += 1
        time.sleep(1)

if __name__ == "__main__":
    main()
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Memory leak from log buffers | Ring buffer with max 10K lines |
| Orphan processes on crash | Add process cleanup on SIGINT/SIGTERM |
| SSE connection drops | Client-side auto-reconnect with exponential backoff |
| xterm.js SSR issues | Dynamic import with `next/dynamic` and `ssr: false` |

---

## Awaiting Approval

Please review this plan and confirm:
1. SSE approach is acceptable (vs Socket.io)
2. The planned file structure works for you
3. Any additional features you'd like included

Once approved, I'll proceed to **Step 2: Scaffold & Core**.
