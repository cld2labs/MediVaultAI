import logging
from typing import Optional
import httpx
import config

logger = logging.getLogger(__name__)


class FlowiseClient:
    def __init__(self):
        self.endpoint = config.FLOWISE_ENDPOINT.rstrip("/")
        self.api_key = config.FLOWISE_API_KEY
        self._headers = {"Content-Type": "application/json"}
        if self.api_key:
            self._headers["Authorization"] = f"Bearer {self.api_key}"

    def predict(self, flow_id: str, question: str, overrides: Optional[dict] = None) -> dict:
        """
        Send a question to a Flowise chatflow and return the full response dict.
        The ConversationalRetrievalQAChain returns:
          { "text": "...", "sourceDocuments": [...], "chatId": "..." }
        """
        payload: dict = {"question": question}
        if overrides:
            payload["overrideConfig"] = overrides

        url = f"{self.endpoint}/api/v1/prediction/{flow_id}"
        logger.info("Flowise predict → flow=%s question_len=%d", flow_id, len(question))
        with httpx.Client(timeout=180.0) as client:
            response = client.post(url, json=payload, headers=self._headers)
            if not response.is_success:
                logger.error(
                    "Flowise predict failed: %s — %s",
                    response.status_code,
                    response.text[:500],
                )
            response.raise_for_status()
            return response.json()

    def upsert(self, flow_id: str, text: str, metadata: Optional[dict] = None) -> dict:
        """
        Upsert a document into the Flowise QA flow's vector store (ChromaDB).

        Flowise upsert endpoint: POST /api/v1/vector/upsert/{flow_id}
        - `question`      : the raw text to embed and store
        - `overrideConfig`: passed through to the vector store node as runtime config.
                            We flatten metadata keys here so Flowise passes them to
                            the ChromaDB document's metadata dict.
        """
        url = f"{self.endpoint}/api/v1/vector/upsert/{flow_id}"
        override: dict = {}
        if metadata:
            override.update(metadata)

        payload: dict = {"question": text}
        if override:
            payload["overrideConfig"] = override

        logger.info("Flowise upsert → flow=%s text_len=%d", flow_id, len(text))
        with httpx.Client(timeout=180.0) as client:
            response = client.post(url, json=payload, headers=self._headers)
            if not response.is_success:
                logger.error(
                    "Flowise upsert failed: %s — %s",
                    response.status_code,
                    response.text[:500],
                )
            response.raise_for_status()
            return response.json()

    def is_connected(self) -> bool:
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(
                    f"{self.endpoint}/api/v1/ping",
                    headers=self._headers,
                )
                return response.status_code == 200
        except Exception:
            return False


_flowise_client: Optional[FlowiseClient] = None


def get_flowise_client() -> FlowiseClient:
    global _flowise_client
    if _flowise_client is None:
        _flowise_client = FlowiseClient()
    return _flowise_client
