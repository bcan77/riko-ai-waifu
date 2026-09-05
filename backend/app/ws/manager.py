from fastapi import WebSocket
import asyncio, json, time
from typing import Dict

class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, WebSocket] = {}
        self._tasks: Dict[str, asyncio.Task] = {}

    async def connect(self, ws: WebSocket, client_id: str):
        await ws.accept()
        self.active[client_id] = ws

    def disconnect(self, client_id: str):
        self.active.pop(client_id, None)
        task = self._tasks.pop(client_id, None)
        if task and not task.done():
            task.cancel()

    async def send_json(self, client_id: str, payload: dict):
        ws = self.active.get(client_id)
        if ws:
            await ws.send_text(json.dumps(payload, ensure_ascii=False))

    async def send_bytes(self, client_id: str, data: bytes):
        ws = self.active.get(client_id)
        if ws:
            await ws.send_bytes(data)

    def set_task(self, client_id: str, task: asyncio.Task):
        old = self._tasks.get(client_id)
        if old and not old.done():
            old.cancel()
        self._tasks[client_id] = task

    def cancel_task(self, client_id: str):
        t = self._tasks.get(client_id)
        if t and not t.done():
            t.cancel()

manager = ConnectionManager()
