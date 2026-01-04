#!/usr/bin/env python3
"""
Test service that prints colored output to verify:
1. ANSI color code rendering in xterm.js
2. Unbuffered output (PYTHONUNBUFFERED=1)
3. Process termination (tree-kill)

Run with: python test_service.py
"""

import time
import sys
import signal

# ANSI color codes
COLORS = {
    'red': '\033[91m',
    'green': '\033[92m',
    'yellow': '\033[93m',
    'blue': '\033[94m',
    'magenta': '\033[95m',
    'cyan': '\033[96m',
    'white': '\033[97m',
    'bold': '\033[1m',
    'dim': '\033[2m',
    'reset': '\033[0m'
}

def signal_handler(signum, frame):
    """Handle termination signals gracefully"""
    sig_name = signal.Signals(signum).name
    print(f"\n{COLORS['yellow']}⚠️  Received {sig_name}, shutting down...{COLORS['reset']}")
    sys.stdout.flush()
    sys.exit(0)

def main():
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    print(f"{COLORS['bold']}{COLORS['green']}🚀 Test Service Started!{COLORS['reset']}")
    print(f"{COLORS['dim']}Testing ANSI colors and unbuffered output...{COLORS['reset']}")
    print()
    
    # Test all colors
    print(f"{COLORS['bold']}Color Test:{COLORS['reset']}")
    for name, code in COLORS.items():
        if name not in ('reset', 'bold', 'dim'):
            print(f"  {code}■ {name}{COLORS['reset']}")
    print()
    
    counter = 0
    color_cycle = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']
    
    try:
        while True:
            color = color_cycle[counter % len(color_cycle)]
            timestamp = time.strftime('%H:%M:%S')
            
            # Print colored heartbeat
            print(f"{COLORS[color]}[{timestamp}] Heartbeat #{counter:04d}{COLORS['reset']}")
            
            # Explicit flush (though PYTHONUNBUFFERED should handle this)
            sys.stdout.flush()
            
            counter += 1
            time.sleep(1)
            
    except KeyboardInterrupt:
        print(f"\n{COLORS['yellow']}✋ Interrupted by user{COLORS['reset']}")
        sys.exit(0)

if __name__ == "__main__":
    main()
