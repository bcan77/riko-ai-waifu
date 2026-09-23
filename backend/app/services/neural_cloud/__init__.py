"""Neural Cloud — user-uploaded files (images, documents) the AI can use.

Images are described once at upload via the vision model (openrouter/free);
documents expose extracted text. File *contents* are never injected into the
system prompt — the LLM reaches them through tool calls (cloud_list_files,
cloud_read_file, cloud_search) only when needed.
"""
