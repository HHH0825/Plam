"""Request-local total deadlines for short payment relay invocations."""
from contextvars import ContextVar
from contextlib import contextmanager
import time

_deadline = ContextVar('palm_payment_deadline', default=None)


class BudgetExceeded(TimeoutError):
    pass


def remaining(default=5, reserve=0):
    deadline = _deadline.get()
    if deadline is None:
        return default
    left = deadline - time.monotonic() - reserve
    if left <= 0:
        raise BudgetExceeded('payment_deadline')
    return min(default, left)


@contextmanager
def budget(seconds=2):
    outer = _deadline.get()
    token = _deadline.set(min(outer, time.monotonic() + seconds) if outer is not None else time.monotonic() + seconds)
    try:
        yield
    finally:
        _deadline.reset(token)


def read_response(response, limit, default=5):
    if _deadline.get() is None:
        return response.read(limit)
    chunks, size = [], 0
    reader = getattr(response, 'read1', None) or response.read
    while size < limit:
        timeout = remaining(default)
        sock = getattr(getattr(getattr(response, 'fp', None), 'raw', None), '_sock', None)
        if sock:
            sock.settimeout(timeout)
        part = reader(min(65536, limit-size))
        remaining(default)
        if not part:
            break
        chunks.append(part)
        size += len(part)
    return b''.join(chunks)


@contextmanager
def lock_with_budget(lock):
    if not lock.acquire(timeout=remaining()):
        raise BudgetExceeded('payment_lock_deadline')
    try:
        yield
    finally:
        lock.release()
