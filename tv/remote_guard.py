from __future__ import print_function
"""TV-only evdev filter. Python 2.7 (TV) and Python 3 (policy tests).

The physical LGE RCU is temporarily grabbed and forwarded to the existing IoT keypad.
Closing the process releases the grab in the kernel. No LG process is patched.
"""
import array
import errno
import fcntl
import glob
import json
import os
import select
import signal
import struct
import subprocess
import sys
import time

BASE = '/var/lib/sofa-goblin'
CONTEXT = '/tmp/sofa-goblin-guard-context.json'
PID = '/tmp/sofa-goblin-guard.pid'
LOG = '/tmp/sofa-goblin-guard.log'
PHYS = 'sofa-goblin-guard/'
APPS = set(['youtube.leanback.v4', 'netflix', 'amazon',
            'com.disney.disneyplus-prod', 'com.tubitv.ott.tubi'])
KEYS = {412: 'Back', 773: 'Home', 241: 'Source', 174: 'Exit',
        1037: 'Netflix', 1038: 'Prime Video', 1042: 'Disney+', 1044: 'Rakuten TV'}
EVENT = struct.Struct('llHHi')


class Policy(object):
    def __init__(self, keys=None, window=2.0):
        self.keys = keys if keys is not None else KEYS
        self.window = window
        self.pending = None
        self.down = {}
        self.session = None

    def key(self, code, value, now, protected, session, route_home=False):
        """Return pass, block, tap or home. A held key is never a second press."""
        if session != self.session or not protected:
            self.pending = None
            self.session = session
        if value == 0:
            suppressed = self.down.pop(code, False)
            if suppressed and self.pending and self.pending[0] == code:
                self.pending = (code, now + self.window, True)
            return 'block' if suppressed else 'pass'
        if value == 2 or code in self.down:
            return 'block' if self.down.get(code, False) else 'pass'
        if value != 1:
            return 'pass'
        if code == 773 and route_home and not protected:
            self.pending = None
            self.down[code] = True
            return 'home'
        if not protected or code not in self.keys:
            self.pending = None
            self.down[code] = False
            return 'pass'
        self.down[code] = True
        if self.pending and self.pending[0] == code and self.pending[2] and now <= self.pending[1]:
            self.pending = None
            return 'home' if code == 773 and route_home else 'tap'
        self.pending = (code, now + self.window, False)
        return 'block'


def ioctl_code(direction, kind, number, size=0):
    return (direction << 30) | (size << 16) | (ord(kind) << 8) | number


def read_ioctl(fd, number, size):
    data = array.array('B', [0] * size)
    fcntl.ioctl(fd, ioctl_code(2, 'E', number, size), data, True)
    return data.tobytes() if hasattr(data, 'tobytes') else data.tostring()


def bits(data):
    values = bytearray(data)
    return [i for i in range(len(values) * 8) if values[i // 8] & (1 << (i % 8))]


def monotonic():
    # Python 2 lacks time.monotonic; Linux uptime is unaffected by clock updates.
    if hasattr(time, 'monotonic'):
        return time.monotonic()
    with open('/proc/uptime') as handle:
        return float(handle.read().split()[0])


def log(message):
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 65536:
            os.rename(LOG, LOG + '.1')
        with open(LOG, 'a') as handle:
            handle.write(time.strftime('%Y-%m-%dT%H:%M:%S') + ' ' + message + '\n')
    except (IOError, OSError):
        pass


def context_state(value, now, guard_enabled, home_enabled):
    age = now - value['updatedAt']
    fresh = 0 <= age < 6000 and value.get('active') and guard_enabled
    pid = value.get('managerPid')
    route = (fresh and home_enabled and value.get('homeRouting') is True
             and isinstance(pid, int) and pid > 1)
    return (bool(fresh and value.get('appId') in APPS), value.get('session'),
            pid if route else None)


def context():
    try:
        with open(CONTEXT) as handle:
            value = json.load(handle)
        return context_state(value, time.time() * 1000,
                             os.path.isfile(BASE + '/guard-enabled'),
                             os.path.isfile(BASE + '/enabled'))
    except (IOError, OSError, ValueError, KeyError, TypeError):
        return False, None, None


def request_home(pid):
    # Check the process identity before signaling; stale context fails open.
    try:
        with open('/proc/%d/cmdline' % pid, 'rb') as handle:
            args = handle.read(4096).split(b'\0')
        if args[:2] != [b'/usr/bin/node', b'/var/lib/sofa-goblin/home-manager.js']:
            return False
        os.kill(pid, signal.SIGUSR2)
        return True
    except (IOError, OSError, TypeError):
        return False


class Mirror(object):
    def __init__(self, path, heartbeat):
        self.source = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
        self.output = None
        self.held = set()
        self.heartbeat = heartbeat
        try:
            name = read_ioctl(self.source, 0x06, 256).split(b'\0')[0]
            if name != b'LGE RCU':
                raise RuntimeError('Uncalibrated input device')
            if bits(read_ioctl(self.source, 0x22, 256)):
                raise RuntimeError('This remote has uncalibrated relative axes')
            self.output = os.open(find_named('IoT keypad'), os.O_RDWR | os.O_NONBLOCK)
            self.supported = set(bits(read_ioctl(self.output, 0x21, 256)))
            if not set(KEYS).issubset(self.supported):
                raise RuntimeError('Output device does not support protected buttons')
        except Exception:
            self.close()
            raise

    def grab(self):
        if bits(read_ioctl(self.source, 0x18, 256)):
            raise RuntimeError('A remote key is held; retry after releasing it')
        fcntl.ioctl(self.source, ioctl_code(1, 'E', 0x90, 4), 1)

    def write(self, data):
        for offset in range(0, len(data), EVENT.size):
            _, _, kind, code, value = EVENT.unpack(data[offset:offset + EVENT.size])
            if kind == 1:
                if code not in self.supported:
                    raise RuntimeError('Unmapped physical key; restoring original input')
                if value == 1:
                    self.held.add(code)
                elif value == 0:
                    self.held.discard(code)
        os.write(self.heartbeat, json.dumps(sorted(self.held)).encode('ascii') + b'\n')
        if os.write(self.output, data) != len(data):
            raise RuntimeError('Incomplete input write')

    def tap(self, code):
        self.write(EVENT.pack(0, 0, 1, code, 1) + EVENT.pack(0, 0, 0, 0, 0))
        time.sleep(0.03)
        self.write(EVENT.pack(0, 0, 1, code, 0) + EVENT.pack(0, 0, 0, 0, 0))

    def close(self):
        if self.output is not None:
            for code in list(self.held):
                try:
                    os.write(self.output, EVENT.pack(0, 0, 1, code, 0) + EVENT.pack(0, 0, 0, 0, 0))
                except OSError:
                    pass
            os.close(self.output)
            self.output = None
        if self.source is not None:
            os.close(self.source)
            self.source = None


def find_named(wanted):
    for path in glob.glob('/sys/class/input/event*/device/name'):
        with open(path) as handle:
            if handle.read().strip() == wanted:
                return '/dev/input/' + path.split('/')[4]
    raise RuntimeError('Input device unavailable: ' + wanted)


def find_source():
    for path in glob.glob('/sys/class/input/event*/device/name'):
        with open(path) as handle:
            name = handle.read().strip()
        phys = path.rsplit('/', 1)[0] + '/phys'
        with open(phys) as handle:
            physical = handle.read().strip()
        if name == 'LGE RCU' and not physical.startswith(PHYS):
            return '/dev/input/' + path.split('/')[4]
    raise RuntimeError('Calibrated LGE RCU device is unavailable')


def release_output(path, held):
    # Recover held keys even if the filter is killed before its finally block.
    try:
        fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)
        for code in held:
            os.write(fd, EVENT.pack(0, 0, 1, code, 0) + EVENT.pack(0, 0, 0, 0, 0))
        os.close(fd)
    except (IOError, OSError):
        pass


def watchdog():
    """Fork before opening input FDs; a stalled filter is killed within 4 seconds."""
    reader, writer = os.pipe()
    parent = os.getpid()
    output_path = find_named('IoT keypad')
    child = os.fork()
    if child == 0:
        os.close(writer)
        held, buffer = [], b''
        while True:
            ready, _, _ = select.select([reader], [], [], 4)
            if not ready:
                try:
                    os.kill(parent, signal.SIGKILL)
                except OSError:
                    pass
                release_output(output_path, held)
                os._exit(1)
            chunk = os.read(reader, 4096)
            if not chunk:
                release_output(output_path, held)
                os._exit(0)
            buffer += chunk
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                if line.startswith(b'['):
                    held = json.loads(line.decode('ascii'))
    os.close(reader)
    return writer, child


def main():
    duration = float(sys.argv[2]) if len(sys.argv) == 3 and sys.argv[1] == '--trial' else 0
    # Input services may finish initializing after the Homebrew boot hook.
    deadline = monotonic() + 30
    while True:
        try:
            find_source()
            find_named('IoT keypad')
            break
        except RuntimeError:
            if monotonic() >= deadline:
                raise
            time.sleep(1)
    heartbeat, watcher = watchdog()
    mirror = None
    children = []
    running = [True]
    def stop(signum, frame):
        running[0] = False
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        mirror = Mirror(find_source(), heartbeat)
        mirror.grab()
        with open(PID, 'w') as handle:
            handle.write(str(os.getpid()))
        log('Filter started; physical LGE RCU mirrored. Trial=' + str(duration))
        policy = Policy()
        started = monotonic()
        last_toast = -100
        while running[0] and (not duration or monotonic() - started < duration):
            os.write(heartbeat, b'.\n')
            now = monotonic()
            for child, born in children[:]:
                if child.poll() is not None:
                    child.stdin.close()
                    children.remove((child, born))
                elif now - born > 3:
                    child.kill()
            ready, _, _ = select.select([mirror.source], [], [], 0.25)
            if not ready:
                continue
            data = os.read(mirror.source, EVENT.size * 64)
            if not data or len(data) % EVENT.size:
                raise RuntimeError('Invalid input read')
            for offset in range(0, len(data), EVENT.size):
                raw = data[offset:offset + EVENT.size]
                _, _, kind, code, value = EVENT.unpack(raw)
                if kind == 0 and code == 3:
                    raise RuntimeError('Input queue overflow; restoring the original remote')
                if kind != 1:
                    mirror.write(raw)
                    continue
                protected, session, home_pid = context()
                action = policy.key(code, value, now, protected, session, home_pid is not None)
                if action == 'pass':
                    mirror.write(raw)
                elif action == 'tap':
                    mirror.tap(code)
                    log('Confirmed ' + KEYS[code])
                elif action == 'home':
                    if request_home(home_pid):
                        log('Requested Sofa Goblin directly')
                    else:
                        mirror.tap(code)
                        log('Home manager unavailable; passed native Home')
                elif value == 1 and code in KEYS:
                    log('Blocked first ' + KEYS[code])
                    if now - last_toast > 2:
                        last_toast = now
                        payload = {'sourceId': 'com.webos.service.secondscreen.gateway',
                                   'message': KEYS[code] + ': press again within 2 seconds'}
                        with open(os.devnull, 'w') as sink:
                            child = subprocess.Popen(['/usr/bin/luna-send', '-a', payload['sourceId'], '-n', '1',
                                                      'luna://com.webos.notification/createToast', json.dumps(payload)],
                                                     stdin=subprocess.PIPE, stdout=sink, stderr=sink, close_fds=True)
                        children.append((child, now))
    finally:
        if mirror:
            mirror.close()
        os.close(heartbeat)
        os.waitpid(watcher, 0)
        for child, _ in children:
            if child.poll() is None:
                child.kill()
            child.wait()
            child.stdin.close()
        try:
            os.unlink(PID)
        except OSError:
            pass
        log('Filter stopped; original remote restored.')


if __name__ == '__main__':
    main()
