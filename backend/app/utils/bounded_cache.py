"""Simple bounded TTL cache with LRU eviction to prevent memory leaks."""
import time as _time
from collections import OrderedDict


class BoundedCache:
    """Dict-like cache with max size and TTL. Evicts oldest entries when full.
    Uses time.monotonic() for accurate TTL regardless of system clock changes."""

    def __init__(self, max_size: int = 256, ttl: float = 300):
        self._max = max_size
        self._ttl = ttl
        self._data: OrderedDict[str, tuple] = OrderedDict()

    def get(self, key: str):
        if key not in self._data:
            return None
        val, ts = self._data[key]
        if _time.monotonic() - ts > self._ttl:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return val

    def set(self, key: str, value):
        if key in self._data:
            del self._data[key]
        elif len(self._data) >= self._max:
            self._data.popitem(last=False)
        self._data[key] = (value, _time.monotonic())

    def clear(self):
        self._data.clear()

    def __len__(self):
        return len(self._data)

    def __contains__(self, key):
        return self.get(key) is not None
