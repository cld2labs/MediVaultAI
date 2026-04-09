"""
chroma_client.py
Direct ChromaDB HTTP client for the clinical_kb collection.

Embeddings are generated via Ollama using the configured embedding model.
"""

import logging
import uuid

import config
from services.llm_client import embed

logger = logging.getLogger(__name__)

_COLLECTION_NAME = "clinical_kb"


def _get_client():
    import chromadb
    return chromadb.HttpClient(host=config.CHROMA_HOST, port=config.CHROMA_PORT)


def upsert_document(text: str, metadata: dict) -> str:
    """
    Embed and upsert a document into the clinical_kb collection.
    Returns the document ID.
    """
    doc_id = metadata.get("doc_id") or str(uuid.uuid4())
    try:
        client = _get_client()
        collection = client.get_or_create_collection(name=_COLLECTION_NAME)
        embeddings = embed([text])
        collection.upsert(
            ids=[doc_id],
            documents=[text],
            embeddings=embeddings,
            metadatas=[metadata],
        )
        logger.info("Upserted document %s into %s", doc_id, _COLLECTION_NAME)
        return doc_id
    except Exception as e:
        logger.error("ChromaDB upsert failed: %s", e, exc_info=True)
        raise


def query_documents(query: str, n_results: int = 5) -> list[dict]:
    """
    Query the clinical_kb collection and return matching chunks with metadata.
    """
    try:
        client = _get_client()
        collection = client.get_or_create_collection(name=_COLLECTION_NAME)

        count = collection.count()
        if count == 0:
            logger.info("clinical_kb is empty — no documents to query")
            return []

        query_embeddings = embed([query])
        results = collection.query(
            query_embeddings=query_embeddings,
            n_results=min(n_results, count),
            include=["documents", "metadatas", "distances"],
        )
        docs      = results.get("documents", [[]])[0]
        metas     = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        return [
            {
                "text":     doc,
                "metadata": meta,
                "score":    round(max(0.0, 1 - dist), 4),
            }
            for doc, meta, dist in zip(docs, metas, distances)
        ]
    except Exception as e:
        logger.error("ChromaDB query failed: %s", e, exc_info=True)
        return []


def delete_document(doc_id: str) -> bool:
    """Delete a document from the collection by ID."""
    try:
        client = _get_client()
        collection = client.get_or_create_collection(name=_COLLECTION_NAME)
        collection.delete(ids=[doc_id])
        logger.info("Deleted document %s from %s", doc_id, _COLLECTION_NAME)
        return True
    except Exception as e:
        logger.error("ChromaDB delete failed: %s", e, exc_info=True)
        return False


def is_connected() -> bool:
    try:
        _get_client().heartbeat()
        return True
    except Exception:
        return False
