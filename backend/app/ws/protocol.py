from typing import Literal

# Client -> Server
CLIENT_TYPES = Literal["chat", "ping", "stop", "stt_chunk"]

# Server -> Client
SERVER_TYPES = Literal[
    "llm_start", "llm_token", "llm_end",
    "tts_start", "viseme", "audio", "animation", "done", "error", "interrupted", "pong"
]
