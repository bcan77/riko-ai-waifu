"""
ChromaDB persistent memory — vector store for long-term recall.
Gracefully falls back to in-memory dict if chromadb not installed.
"""
import os, json, pathlib

STORE_DIR = pathlib.Path(__file__).resolve().parents[3] / "memory" / "chroma"
STORE_DIR.mkdir(parents=True, exist_ok=True)

class MemoryStore:
    def __init__(self):
        self._client = None
        self._col = None
        self._has = False
        try:
            import chromadb  # type: ignore
            self._has = True
        except Exception:
            self._has = False
        # fallback file
        self._fallback_path = STORE_DIR / "fallback.jsonl"
        if not self._fallback_path.exists():
            self._fallback_path.write_text("")

    def _ensure(self):
        if not self._has: return False
        if self._client is not None: return True
        try:
            import chromadb
            from chromadb.utils import embedding_functions  # type: ignore
            self._client = chromadb.PersistentClient(path=str(STORE_DIR))
            # try local embedding; if sentence-transformers not installed, use default
            try:
                ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
            except Exception:
                ef = None
            self._col = self._client.get_or_create_collection("waifu_memory", embedding_function=ef)
            return True
        except Exception as e:
            print(f"[memory] chroma init failed {e}")
            self._has = False
            return False

    async def store(self, text: str, meta: dict | None = None):
        meta = meta or {}
        if self._ensure() and self._col is not None:
            try:
                import uuid
                self._col.add(ids=[str(uuid.uuid4())], documents=[text], metadatas=[meta])
                return True
            except Exception as e:
                print(f"[memory] store failed {e}")
        # fallback append
        with open(self._fallback_path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"text": text, "meta": meta}) + "\n")
        return True

    async def search(self, query: str, n: int = 3) -> list[str]:
        if self._ensure() and self._col is not None:
            try:
                res = self._col.query(query_texts=[query], n_results=n)
                docs = res.get("documents", [[]])[0] if res else []
                return docs
            except Exception as e:
                print(f"[memory] search failed {e}")
        # fallback: naive substring
        out=[]
        if self._fallback_path.exists():
            for line in self._fallback_path.read_text(encoding="utf-8").splitlines()[-200:]:
                try:
                    j=json.loads(line)
                    if query.lower().split()[0] in j["text"].lower():
                        out.append(j["text"])
                        if len(out)>=n: break
                except: pass
        return out

memory = MemoryStore()
