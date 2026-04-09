"""
flowise_provisioner.py
Auto-creates AND updates Flowise flows on every FastAPI startup.

Ollama only (ChatOllama + OllamaEmbeddings). No cloud credentials required.

On every restart the provisioner:
  - Creates the flow if it doesn't exist
  - Updates it if it does (so .env changes are always reflected)
"""

import json
import logging
import time
import uuid

import httpx

import config

logger = logging.getLogger(__name__)

_provisioned = False


# ── HTTP helpers ────────────────────────────────────────────────────────────

def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if config.FLOWISE_API_KEY:
        h["Authorization"] = f"Bearer {config.FLOWISE_API_KEY}"
    return h


def _wait_for_flowise(max_attempts: int = 15, delay: float = 4.0) -> bool:
    url = f"{config.FLOWISE_ENDPOINT}/api/v1/ping"
    for attempt in range(1, max_attempts + 1):
        try:
            with httpx.Client(timeout=5.0) as client:
                r = client.get(url)
                if r.status_code == 200:
                    logger.info("Flowise is ready")
                    return True
        except Exception:
            pass
        logger.info("Waiting for Flowise... attempt %d/%d", attempt, max_attempts)
        time.sleep(delay)
    logger.error("Flowise did not become ready after %d attempts", max_attempts)
    return False


def _list_chatflows() -> list[dict]:
    url = f"{config.FLOWISE_ENDPOINT}/api/v1/chatflows"
    with httpx.Client(timeout=15.0) as client:
        r = client.get(url, headers=_headers())
        r.raise_for_status()
        return r.json()


def _create_chatflow(name: str, flow_data: dict) -> str:
    url = f"{config.FLOWISE_ENDPOINT}/api/v1/chatflows"
    payload = {
        "name": name,
        "flowData": json.dumps(flow_data),
        "deployed": True,
        "isPublic": False,
        "type": "CHATFLOW",
    }
    with httpx.Client(timeout=30.0) as client:
        r = client.post(url, json=payload, headers=_headers())
        r.raise_for_status()
        return r.json()["id"]


def _update_chatflow(flow_id: str, name: str, flow_data: dict) -> None:
    url = f"{config.FLOWISE_ENDPOINT}/api/v1/chatflows/{flow_id}"
    payload = {
        "name": name,
        "flowData": json.dumps(flow_data),
        "deployed": True,
        "isPublic": False,
        "type": "CHATFLOW",
    }
    with httpx.Client(timeout=30.0) as client:
        r = client.put(url, json=payload, headers=_headers())
        r.raise_for_status()



# ── Node ID helpers ─────────────────────────────────────────────────────────

def _make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# ── Provider-specific node builders ────────────────────────────────────────

def _chat_node(node_id: str, position: dict, soap_temp: float = 0.1) -> dict:
    """Build a ChatOllama node for a Flowise flow."""
    input_params = [
        {"label": "Base URL",    "name": "baseUrl",    "type": "string",  "default": "http://localhost:11434"},
        {"label": "Model Name",  "name": "modelName",  "type": "string",  "placeholder": "llama3.1:8b"},
        {"label": "Temperature", "name": "temperature","type": "number",  "optional": True},
        {"label": "Top P",       "name": "topP",       "type": "number",  "optional": True, "additionalParams": True},
        {"label": "Top K",       "name": "topK",       "type": "number",  "optional": True, "additionalParams": True},
        {"label": "Keep Alive",  "name": "keepAlive",  "type": "string",  "optional": True, "additionalParams": True},
    ]
    return {
        "id": node_id,
        "type": "genericNode",
        "position": position,
        "data": {
            "id": node_id,
            "label": "ChatOllama",
            "name": "chatOllama",
            "version": 2,
            "type": "ChatOllama",
            "baseClasses": [
                "ChatOllama", "SimpleChatModel",
                "BaseChatModel", "BaseLanguageModel", "Runnable",
            ],
            "category": "Chat Models",
            "inputs": {
                "baseUrl":    config.OLLAMA_BASE_URL,
                "modelName":  config.OLLAMA_MODEL,
                "temperature": soap_temp,
            },
            "inputParams": input_params,
            "outputs": {},
            "selected": False,
        },
    }


def _chat_source_handle(node_id: str) -> str:
    """Return the sourceHandle string for the ChatOllama node output."""
    return (
        f"{node_id}-output-chatOllama-"
        "ChatOllama|SimpleChatModel|BaseChatModel|BaseLanguageModel|Runnable"
    )


def _embed_node(node_id: str, position: dict) -> dict:
    """Build an OllamaEmbeddings node for a Flowise flow."""
    input_params = [
        {"label": "Base URL",   "name": "baseUrl",   "type": "string", "default": "http://localhost:11434"},
        {"label": "Model Name", "name": "modelName", "type": "string", "placeholder": "nomic-embed-text"},
        {"label": "Num GPU",    "name": "numGpu",    "type": "number", "optional": True, "additionalParams": True},
        {"label": "Keep Alive", "name": "keepAlive", "type": "string", "optional": True, "additionalParams": True},
    ]
    return {
        "id": node_id,
        "type": "genericNode",
        "position": position,
        "data": {
            "id": node_id,
            "label": "Ollama Embeddings",
            "name": "ollamaEmbedding",
            "version": 1,
            "type": "OllamaEmbeddings",
            "baseClasses": ["OllamaEmbeddings", "Embeddings"],
            "category": "Embeddings",
            "inputs": {
                "baseUrl":   config.OLLAMA_BASE_URL,
                "modelName": config.OLLAMA_EMBED_MODEL,
            },
            "inputParams": input_params,
            "outputs": {},
            "selected": False,
        },
    }


def _embed_source_handle(node_id: str) -> str:
    """Return the sourceHandle string for the OllamaEmbeddings node output."""
    return f"{node_id}-output-ollamaEmbedding-OllamaEmbeddings|Embeddings"


# ── Flow data builders ──────────────────────────────────────────────────────


def _build_soap_flow_data() -> dict:
    """
    SOAP Generator flow — LLM Chain (no vector store dependency).

    PromptTemplate ──► LLMChain ◄── ChatModel
                           │
                           ▼
                        output (SOAP JSON)

    The transcript is the full context — no retrieval needed.
    Using LLMChain avoids the ChromaDB dependency at prediction time
    and works even when ChromaDB is not running.
    """
    chat_id   = _make_id("chat")
    prompt_id = _make_id("prompt")
    chain_id  = _make_id("chain")

    soap_system_prompt = (
        "You are a clinical documentation specialist.\n"
        "You will receive a diarized doctor-patient consultation transcript "
        "where speakers are labeled Doctor and Patient.\n\n"
        "Generate a structured SOAP note as valid JSON with EXACTLY these keys:\n"
        "  chief_complaint, subjective, objective, assessment, plan, keywords\n\n"
        "STRICT CONTENT RULES:\n"
        "- Use ONLY information explicitly stated in the transcript. Do not invent vitals, medications, or findings not mentioned.\n"
        "- If objective findings were not mentioned in the transcript, write: Not documented in this consultation.\n"
        "- If a field has no information from the transcript, write: Not reported.\n"
        "- Every field except keywords MUST be a plain STRING.\n"
        "- keywords MUST be an object with three flat string arrays.\n\n"
        "OUTPUT FORMAT — return valid JSON matching this exact structure:\n"
        "{{\n"
        "  \"chief_complaint\": \"One sentence summarising the patient's main complaint from the transcript.\",\n"
        "  \"subjective\": \"Prose paragraph summarising what the patient reported: symptoms, duration, severity, history.\",\n"
        "  \"objective\": \"Prose paragraph of clinician findings: vitals, exam findings, test results. If none mentioned, write: Not documented in this consultation.\",\n"
        "  \"assessment\": \"Prose paragraph with clinical impression and differential diagnoses with ICD-10 codes where applicable.\",\n"
        "  \"plan\": \"Prose paragraph with treatment, tests ordered, medications, and follow-up instructions.\",\n"
        "  \"keywords\": {{\n"
        "    \"symptoms\": [\"list\", \"of\", \"symptoms\"],\n"
        "    \"medications\": [\"list\", \"of\", \"medications\"],\n"
        "    \"diagnoses\": [\"list\", \"of\", \"diagnoses\"]\n"
        "  }}\n"
        "}}\n\n"
        "Use proper medical terminology. Return ONLY valid JSON — no markdown fences, no explanation."
    )

    # Human message template — {input} is replaced by the transcript at prediction time
    human_template = "{input}"

    chat_node = _chat_node(chat_id, {"x": 400, "y": 200}, soap_temp=0.1)

    prompt_input_params = [
        {"label": "System Message",   "name": "systemMessagePrompt", "type": "string",    "rows": 4},
        {"label": "Human Message",    "name": "humanMessagePrompt",  "type": "string",    "rows": 4},
        {"label": "Format Prompt Values", "name": "promptValues",   "type": "json",      "optional": True, "acceptVariable": True, "list": True},
    ]

    prompt_node = {
        "id": prompt_id,
        "type": "genericNode",
        "position": {"x": 100, "y": 200},
        "data": {
            "id": prompt_id,
            "label": "Chat Prompt Template",
            "name": "chatPromptTemplate",
            "version": 1,
            "type": "ChatPromptTemplate",
            "baseClasses": ["ChatPromptTemplate", "BaseChatPromptTemplate", "BasePromptTemplate", "Runnable"],
            "category": "Prompts",
            "inputs": {
                "systemMessagePrompt": soap_system_prompt,
                "humanMessagePrompt": human_template,
                "inputVariables": "input",
            },
            "inputParams": prompt_input_params,
            "outputs": {},
            "selected": False,
        },
    }

    llmchain_input_params = [
        {"label": "Language Model",   "name": "model",     "type": "BaseLanguageModel"},
        {"label": "Prompt",           "name": "prompt",    "type": "BasePromptTemplate"},
        {"label": "Output Key",       "name": "outputKey", "type": "string",  "default": "text", "optional": True, "additionalParams": True},
        {"label": "Chain Name",       "name": "chainName", "type": "string",  "optional": True,  "additionalParams": True},
    ]

    chain_node = {
        "id": chain_id,
        "type": "genericNode",
        "position": {"x": 700, "y": 200},
        "data": {
            "id": chain_id,
            "label": "LLM Chain",
            "name": "llmChain",
            "version": 3,
            "type": "LLMChain",
            "baseClasses": ["LLMChain", "BaseChain", "Runnable"],
            "category": "Chains",
            "inputs": {
                "model": f"{{{{{chat_id}.data.instance}}}}",
                "prompt": f"{{{{{prompt_id}.data.instance}}}}",
                "outputKey": "text",
            },
            "inputParams": llmchain_input_params,
            "outputs": {"output": "llmChain"},
            "selected": False,
        },
    }

    nodes = [prompt_node, chat_node, chain_node]
    edges = [
        {
            "id": f"e_{prompt_id}_{chain_id}",
            "source": prompt_id,
            "target": chain_id,
            "sourceHandle": (
                f"{prompt_id}-output-chatPromptTemplate-"
                "ChatPromptTemplate|BaseChatPromptTemplate|BasePromptTemplate|Runnable"
            ),
            "targetHandle": f"{chain_id}-input-prompt-BasePromptTemplate",
            "type": "buttonedge",
        },
        {
            "id": f"e_{chat_id}_{chain_id}",
            "source": chat_id,
            "target": chain_id,
            "sourceHandle": _chat_source_handle(chat_id),
            "targetHandle": f"{chain_id}-input-model-BaseLanguageModel",
            "type": "buttonedge",
        },
    ]

    return {"nodes": nodes, "edges": edges}


def _build_qa_flow_data() -> dict:
    """
    Clinical QA flow.
    ChatModel ──────────────────────────────► ConversationalRetrievalQAChain
    Embeddings ──► Chroma(clinical_kb) ──►
    BufferMemory ───────────────────────────►

    returnSourceDocuments: True → citations in chat responses.
    """
    chat_id   = _make_id("chat")
    embed_id  = _make_id("embed")
    chroma_id = _make_id("chroma")
    memory_id = _make_id("memory")
    chain_id  = _make_id("chain")

    chroma_url = f"http://{config.CHROMA_HOST}:{config.CHROMA_PORT}"

    rephrase_prompt = (
        "Given the conversation history and the follow-up question, "
        "rephrase the follow-up question to be a standalone search query "
        "that retrieves the most relevant clinical documents.\n\n"
        "Chat History: {chat_history}\n"
        "Follow Up: {question}\n"
        "Standalone question:"
    )

    response_prompt = (
        "You are a clinical knowledge base assistant. Answer ONLY from the retrieved context provided.\n\n"
        "Rules:\n"
        "- If the question is not clinical or medical, respond exactly: 'This assistant only answers clinical and medical questions from the knowledge base.'\n"
        "- If the answer is not present in the context, respond exactly: 'No matching information found in the knowledge base. Try approving relevant SOAP notes or uploading clinical guidelines.'\n"
        "- Never use outside knowledge. If context does not contain the answer, use the fallback above.\n"
        "- Give a direct, factual answer in 1-3 sentences. No preamble, no apologies, no 'unfortunately'.\n"
        "- Do not include source tags in your answer — sources are shown separately.\n\n"
        "Context: {context}\n\n"
        "Question: {question}\n\n"
        "Answer:"
    )

    chat_node  = _chat_node(chat_id, {"x": 100, "y": 100}, soap_temp=0.3)
    embed_node = _embed_node(embed_id, {"x": 100, "y": 500})

    chroma_qa_input_params = [
        {"label": "Document",        "name": "document",        "type": "Document",    "list": True, "optional": True},
        {"label": "Embeddings",      "name": "embeddings",      "type": "Embeddings"},
        {"label": "Record Manager",  "name": "recordManager",   "type": "RecordManager", "optional": True},
        {"label": "Collection Name", "name": "collectionName",  "type": "string"},
        {"label": "Chroma URL",      "name": "chromaURL",       "type": "string",      "optional": True},
        {"label": "Chroma Metadata Filter", "name": "chromaMetadataFilter", "type": "json", "optional": True, "additionalParams": True},
        {"label": "Top K",           "name": "topK",            "type": "number",      "optional": True, "additionalParams": True},
    ]

    chroma_node = {
        "id": chroma_id,
        "type": "genericNode",
        "position": {"x": 500, "y": 500},
        "data": {
            "id": chroma_id,
            "label": "Chroma",
            "name": "chroma",
            "version": 1,
            "type": "Chroma",
            "baseClasses": ["Chroma", "VectorStoreRetriever", "BaseRetriever"],
            "category": "Vector Stores",
            "inputs": {
                "embeddings": f"{{{{{embed_id}.data.instance}}}}",
                "collectionName": "clinical_kb",
                "chromaURL": chroma_url,
                "topK": 8,
            },
            "inputParams": chroma_qa_input_params,
            "outputs": {"output": "retriever"},
            "selected": False,
        },
    }

    memory_input_params = [
        {"label": "Session Id",  "name": "sessionId",  "type": "string",  "optional": True, "description": "If not specified, a random id will be used"},
        {"label": "Memory Key",  "name": "memoryKey",  "type": "string",  "default": "chat_history"},
    ]

    memory_node = {
        "id": memory_id,
        "type": "genericNode",
        "position": {"x": 100, "y": 300},
        "data": {
            "id": memory_id,
            "label": "Buffer Memory",
            "name": "bufferMemory",
            "version": 2,
            "type": "BufferMemory",
            "baseClasses": ["BufferMemory", "BaseChatMemory", "BaseMemory"],
            "category": "Memory",
            "inputs": {
                "sessionId": "",
                "memoryKey": "chat_history",
            },
            "inputParams": memory_input_params,
            "outputs": {},
            "selected": False,
        },
    }

    chain_input_params = [
        {"label": "Chat Model",             "name": "model",                 "type": "BaseChatModel"},
        {"label": "Vector Store Retriever", "name": "vectorStoreRetriever",  "type": "BaseRetriever"},
        {"label": "Memory",                 "name": "memory",                "type": "BaseMemory", "optional": True},
        {"label": "Return Source Documents","name": "returnSourceDocuments", "type": "boolean",    "optional": True},
        {"label": "Rephrase Prompt",        "name": "rephrasePrompt",        "type": "string",     "optional": True, "additionalParams": True},
        {"label": "Response Prompt",        "name": "responsePrompt",        "type": "string",     "optional": True, "additionalParams": True},
    ]

    chain_node = {
        "id": chain_id,
        "type": "genericNode",
        "position": {"x": 500, "y": 100},
        "data": {
            "id": chain_id,
            "label": "Conversational Retrieval QA Chain",
            "name": "conversationalRetrievalQAChain",
            "version": 3,
            "type": "ConversationalRetrievalQAChain",
            "baseClasses": ["ConversationalRetrievalQAChain", "BaseChain", "Runnable"],
            "category": "Chains",
            "inputs": {
                "model": f"{{{{{chat_id}.data.instance}}}}",
                "vectorStoreRetriever": f"{{{{{chroma_id}.data.instance}}}}",
                "memory": f"{{{{{memory_id}.data.instance}}}}",
                "returnSourceDocuments": True,
                "rephrasePrompt": rephrase_prompt,
                "responsePrompt": response_prompt,
            },
            "inputParams": chain_input_params,
            "outputs": {},
            "selected": False,
        },
    }

    nodes = [chat_node, embed_node, chroma_node, memory_node, chain_node]
    edges = [
        {
            "id": f"e_{chat_id}_{chain_id}",
            "source": chat_id,
            "target": chain_id,
            "sourceHandle": _chat_source_handle(chat_id),
            "targetHandle": f"{chain_id}-input-model-BaseChatModel",
            "type": "buttonedge",
        },
        {
            "id": f"e_{embed_id}_{chroma_id}",
            "source": embed_id,
            "target": chroma_id,
            "sourceHandle": _embed_source_handle(embed_id),
            "targetHandle": f"{chroma_id}-input-embeddings-Embeddings",
            "type": "buttonedge",
        },
        {
            "id": f"e_{chroma_id}_{chain_id}",
            "source": chroma_id,
            "target": chain_id,
            "sourceHandle": f"{chroma_id}-output-retriever-Chroma|VectorStoreRetriever|BaseRetriever",
            "targetHandle": f"{chain_id}-input-vectorStoreRetriever-BaseRetriever",
            "type": "buttonedge",
        },
        {
            "id": f"e_{memory_id}_{chain_id}",
            "source": memory_id,
            "target": chain_id,
            "sourceHandle": f"{memory_id}-output-bufferMemory-BufferMemory|BaseChatMemory|BaseMemory",
            "targetHandle": f"{chain_id}-input-memory-BaseMemory",
            "type": "buttonedge",
        },
    ]

    return {"nodes": nodes, "edges": edges}


def _build_upsert_flow_data() -> dict:
    """
    KB Upsert flow — PlainText Document Loader → Chroma (upsert mode) ← Embeddings

    PlainText ──► Chroma ◄── Embeddings
                   │
                   ▼
              (writes to clinical_kb collection)
    """
    plaintext_id = _make_id("plaintext")
    embed_id     = _make_id("embed")
    chroma_id    = _make_id("chroma")

    chroma_url = f"http://{config.CHROMA_HOST}:{config.CHROMA_PORT}"

    embed_node = _embed_node(embed_id, {"x": 100, "y": 400})

    # inputParams must mirror the node class's inputs array.
    # The Flowise upsert handler iterates nodeData.inputs and calls
    # nodeData.inputParams.find(...) — if inputParams is absent the call crashes.
    # The Flowise UI populates this automatically; the provisioner must do it explicitly.
    plaintext_input_params = [
        {"label": "Text", "name": "text", "type": "string", "rows": 4},
        {"label": "Text Splitter", "name": "textSplitter", "type": "TextSplitter", "optional": True},
        {"label": "Additional Metadata", "name": "metadata", "type": "json", "optional": True, "additionalParams": True},
        {"label": "Omit Metadata Keys", "name": "omitMetadataKeys", "type": "string", "optional": True, "additionalParams": True},
    ]

    plaintext_node = {
        "id": plaintext_id,
        "type": "genericNode",
        "position": {"x": 100, "y": 100},
        "data": {
            "id": plaintext_id,
            "label": "Plain Text",
            "name": "plainText",
            "version": 2,
            "type": "Document",
            "baseClasses": ["Document"],
            "category": "Document Loaders",
            # text is overridden at upsert time via overrideConfig.text
            "inputs": {"text": "", "metadata": ""},
            # inputParams mirrors the node class inputs array required by Flowise
            "inputParams": plaintext_input_params,
            "outputAnchors": [{"id": f"{plaintext_id}-output-document-Document", "name": "document", "label": "Document", "description": "Array of document objects", "type": "Document"}],
            "outputs": {"output": "document"},
            "selected": False,
        },
    }

    chroma_input_params = [
        {"label": "Document",        "name": "document",        "type": "Document",    "list": True, "optional": True},
        {"label": "Embeddings",      "name": "embeddings",      "type": "Embeddings"},
        {"label": "Record Manager",  "name": "recordManager",   "type": "RecordManager", "optional": True},
        {"label": "Collection Name", "name": "collectionName",  "type": "string"},
        {"label": "Chroma URL",      "name": "chromaURL",       "type": "string",      "optional": True},
        {"label": "Chroma Metadata Filter", "name": "chromaMetadataFilter", "type": "json", "optional": True, "additionalParams": True},
        {"label": "Top K",           "name": "topK",            "type": "number",      "optional": True, "additionalParams": True},
    ]

    chroma_node = {
        "id": chroma_id,
        "type": "genericNode",
        "position": {"x": 500, "y": 200},
        "data": {
            "id": chroma_id,
            "label": "Chroma",
            "name": "chroma",
            "version": 2,
            "type": "Chroma",
            "baseClasses": ["Chroma", "VectorStoreRetriever", "BaseRetriever"],
            "category": "Vector Stores",
            "inputs": {
                # Flowise resolves node-to-node connections via {{nodeId.data.instance}} syntax
                "document":       f"{{{{{plaintext_id}.data.instance}}}}",
                "embeddings":     f"{{{{{embed_id}.data.instance}}}}",
                "collectionName": "clinical_kb",
                "chromaURL":      chroma_url,
            },
            "inputParams": chroma_input_params,
            "outputs": {"output": "retriever"},
            "selected": False,
        },
    }

    nodes = [plaintext_node, embed_node, chroma_node]
    edges = [
        {
            "id": f"e_{plaintext_id}_{chroma_id}",
            "source": plaintext_id,
            "target": chroma_id,
            "sourceHandle": f"{plaintext_id}-output-document-Document",
            "targetHandle": f"{chroma_id}-input-document-Document",
            "type": "buttonedge",
        },
        {
            "id": f"e_{embed_id}_{chroma_id}",
            "source": embed_id,
            "target": chroma_id,
            "sourceHandle": _embed_source_handle(embed_id),
            "targetHandle": f"{chroma_id}-input-embeddings-Embeddings",
            "type": "buttonedge",
        },
    ]

    return {"nodes": nodes, "edges": edges}


# ── Public API ──────────────────────────────────────────────────────────────

def provision() -> bool:
    """
    Called once at FastAPI startup.
    1. Wait for Flowise
    2. Provision API credentials for the active LLM provider
    3. Create or update both flows with current .env values
    """
    global _provisioned

    if not _wait_for_flowise():
        logger.error("Flowise did not become ready — skipping flow provisioning")
        return False

    logger.info("Provisioning flows — Ollama model=%s embed=%s", config.OLLAMA_MODEL, config.OLLAMA_EMBED_MODEL)

    try:
        # flows
        existing      = _list_chatflows()
        existing_by_name = {f.get("name"): f.get("id") for f in existing}

        # SOAP Generator
        soap_data = _build_soap_flow_data()
        if config.SOAP_FLOW_NAME in existing_by_name:
            config.SOAP_FLOW_ID = existing_by_name[config.SOAP_FLOW_NAME]
            _update_chatflow(config.SOAP_FLOW_ID, config.SOAP_FLOW_NAME, soap_data)
            logger.info("SOAP flow updated: %s", config.SOAP_FLOW_ID)
        else:
            config.SOAP_FLOW_ID = _create_chatflow(config.SOAP_FLOW_NAME, soap_data)
            logger.info("SOAP flow created: %s", config.SOAP_FLOW_ID)

        # Clinical QA
        qa_data = _build_qa_flow_data()
        if config.QA_FLOW_NAME in existing_by_name:
            config.QA_FLOW_ID = existing_by_name[config.QA_FLOW_NAME]
            _update_chatflow(config.QA_FLOW_ID, config.QA_FLOW_NAME, qa_data)
            logger.info("QA flow updated: %s", config.QA_FLOW_ID)
        else:
            config.QA_FLOW_ID = _create_chatflow(config.QA_FLOW_NAME, qa_data)
            logger.info("QA flow created: %s", config.QA_FLOW_ID)

        # KB Upsert (PlainText → Chroma) — separate from QA flow
        upsert_data = _build_upsert_flow_data()
        if config.UPSERT_FLOW_NAME in existing_by_name:
            config.UPSERT_FLOW_ID = existing_by_name[config.UPSERT_FLOW_NAME]
            _update_chatflow(config.UPSERT_FLOW_ID, config.UPSERT_FLOW_NAME, upsert_data)
            logger.info("Upsert flow updated: %s", config.UPSERT_FLOW_ID)
        else:
            config.UPSERT_FLOW_ID = _create_chatflow(config.UPSERT_FLOW_NAME, upsert_data)
            logger.info("Upsert flow created: %s", config.UPSERT_FLOW_ID)

        _provisioned = True
        return True

    except Exception as e:
        logger.error("Flow provisioning failed: %s", e, exc_info=True)
        return False


def is_provisioned() -> bool:
    return _provisioned and bool(config.SOAP_FLOW_ID) and bool(config.QA_FLOW_ID) and bool(config.UPSERT_FLOW_ID)
