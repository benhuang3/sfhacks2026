"""
In-memory MongoDB fallback — used when MongoDB credentials are invalid.
Provides a _MemCollection shim that quacks like a Motor collection.
"""

from __future__ import annotations
from types import SimpleNamespace

_mem_counter = 0


def _next_id(prefix: str) -> str:
    global _mem_counter
    _mem_counter += 1
    return f"mem_{prefix}_{_mem_counter}"


def is_db_available() -> bool:
    """Check auth module's DB availability flag."""
    try:
        from auth import _db_available
        return _db_available is True
    except ImportError:
        return True


def _match(doc: dict, filt: dict) -> bool:
    """Simple filter matching — handles _id as string or ObjectId."""
    for k, v in filt.items():
        doc_val = doc.get(k)
        if k == "_id":
            if str(doc_val) != str(v):
                return False
        elif isinstance(v, dict):
            continue
        elif doc_val != v:
            return False
    return True


def _apply_update(doc: dict, update: dict):
    """Apply MongoDB-style update operators ($set, $push, $pull) in-place."""
    for k, v in update.get("$set", {}).items():
        if ".$[" in k:
            continue
        parts = k.split(".")
        target = doc
        for p in parts[:-1]:
            target = target.setdefault(p, {})
        target[parts[-1]] = v
    for k, v in update.get("$push", {}).items():
        parts = k.split(".")
        target = doc
        for p in parts[:-1]:
            target = target.setdefault(p, {})
        lst = target.setdefault(parts[-1], [])
        lst.append(v)
    for k, v in update.get("$pull", {}).items():
        parts = k.split(".")
        target = doc
        for p in parts[:-1]:
            target = target.get(p, {})
        lst = target.get(parts[-1], [])
        if isinstance(v, dict):
            fk, fv = next(iter(v.items()))
            target[parts[-1]] = [item for item in lst if item.get(fk) != fv]
        else:
            target[parts[-1]] = [item for item in lst if item != v]


class _MemCursor:
    """Async-iterable cursor over in-memory docs."""

    def __init__(self, docs: list[dict]):
        self._docs = list(docs)

    def sort(self, key: str, direction: int = -1):
        self._docs.sort(key=lambda d: d.get(key, ""), reverse=(direction == -1))
        return self

    def limit(self, n: int):
        self._docs = self._docs[:n]
        return self

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class MemCollection:
    """Dict-backed shim that quacks like a Motor collection."""

    def __init__(self, store: dict, prefix: str):
        self._store = store
        self._prefix = prefix

    async def find_one(self, filt: dict, projection=None):
        for doc in self._store.values():
            if _match(doc, filt):
                return {**doc}
        return None

    async def insert_one(self, doc: dict):
        oid = _next_id(self._prefix)
        doc["_id"] = oid
        self._store[oid] = doc
        return SimpleNamespace(inserted_id=oid)

    def find(self, filt: dict = None):
        filt = filt or {}
        matched = [dict(d) for d in self._store.values() if _match(d, filt)]
        return _MemCursor(matched)

    async def find_one_and_update(self, filt, update, return_document=None):
        for doc in self._store.values():
            if _match(doc, filt):
                _apply_update(doc, update)
                return {**doc}
        return None

    async def update_one(self, filt, update, upsert=False, array_filters=None):
        for doc in self._store.values():
            if _match(doc, filt):
                _apply_update(doc, update)
                return SimpleNamespace(modified_count=1)
        if upsert:
            new_doc = {**filt, **update.get("$set", {})}
            oid = _next_id(self._prefix)
            new_doc["_id"] = oid
            self._store[oid] = new_doc
            return SimpleNamespace(modified_count=0, upserted_id=oid)
        return SimpleNamespace(modified_count=0)

    async def update_many(self, filt, update):
        count = 0
        for doc in self._store.values():
            if _match(doc, filt):
                _apply_update(doc, update)
                count += 1
        return SimpleNamespace(modified_count=count)

    async def delete_one(self, filt):
        for key, doc in list(self._store.items()):
            if _match(doc, filt):
                del self._store[key]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def delete_many(self, filt):
        to_del = [k for k, d in self._store.items() if _match(d, filt)]
        for k in to_del:
            del self._store[k]
        return SimpleNamespace(deleted_count=len(to_del))

    async def create_index(self, *a, **kw):
        pass
