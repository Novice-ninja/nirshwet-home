#!/bin/sh
set -e
base=/var/lib/sofa-goblin
running() {
    [ -f /tmp/sofa-goblin-guard.pid ] || return 1
    guard_pid=$(cat /tmp/sofa-goblin-guard.pid)
    case "$guard_pid" in ''|*[!0-9]*) return 1;; esac
    grep -q '/var/lib/sofa-goblin/remote_guard.py' "/proc/$guard_pid/cmdline" 2>/dev/null
}
case "${1:-status}" in
    on)
        touch "$base/guard-enabled"
        if ! running; then
            /var/lib/webosbrew/init.d/55-sofa-goblin-guard
            count=0
            while ! running && [ "$count" -lt 3 ]; do sleep 1; count=$((count+1)); done
        fi
        ;;
    off)
        rm -f "$base/guard-enabled"
        if running; then
            kill "$guard_pid"
            count=0
            while running && [ "$count" -lt 6 ]; do sleep 1; count=$((count+1)); done
        fi
        ;;
    status) ;;
    *) echo 'Expected on, off, or status' >&2; exit 1;;
esac
enabled=false; alive=false
[ ! -f "$base/guard-enabled" ] || enabled=true
if running; then alive=true; fi
printf '{"enabled":%s,"running":%s}\n' "$enabled" "$alive"
