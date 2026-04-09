import os
import json
import uuid
import tempfile
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

import config
from models import (
    TranscribeResponse,
    GenerateSoapRequest, GenerateSoapResponse, SoapNote, SoapKeywords,
    GenerateBillingRequest, BillingCodesResponse, BillingCode,
    ApproveNoteRequest, ApproveNoteResponse,
    ChatRequest, ChatResponse, CitedSource,
    IngestDocumentResponse, DocumentRecord, DocumentsListResponse,
    HealthResponse,
)
from services import (
    get_flowise_client, get_whisper_client,
    provision, is_provisioned,
    extract_text_from_pdf, validate_pdf_file,
    generate_soap as llm_generate_soap,
    generate_billing_codes as llm_generate_billing_codes,
    answer_question as llm_answer_question,
    diarize_segments,
    upsert_document, query_documents,
    delete_document as chroma_delete_document,
    chroma_is_connected,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

_documents_store: list[DocumentRecord] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.flowise = get_flowise_client()
    app.state.whisper = get_whisper_client()
    logger.info("Starting Flowise flow provisioning...")
    provision()
    logger.info(f"Flows provisioned: {is_provisioned()} — SOAP={config.SOAP_FLOW_ID} QA={config.QA_FLOW_ID}")
    yield
    logger.info("MediVault AI API shutdown")


app = FastAPI(
    title=config.APP_TITLE,
    description=config.APP_DESCRIPTION,
    version=config.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOW_ORIGINS,
    allow_credentials=config.CORS_ALLOW_CREDENTIALS,
    allow_methods=config.CORS_ALLOW_METHODS,
    allow_headers=config.CORS_ALLOW_HEADERS,
)


@app.get("/")
def root():
    return {
        "message": "MediVault AI API",
        "version": config.APP_VERSION,
        "status": "healthy",
    }


@app.get("/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(
        status="healthy",
        flowise_connected=app.state.flowise.is_connected(),
        whisper_connected=app.state.whisper.is_connected(),
        flows_provisioned=is_provisioned(),
        version=config.APP_VERSION,
    )


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    content = await file.read()
    file_size = len(content)

    if file_size > config.MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Audio file too large ({file_size / 1024 / 1024:.1f} MB). Max {config.MAX_AUDIO_SIZE / 1024 / 1024:.0f} MB.",
        )

    ext = os.path.splitext(file.filename or "audio.wav")[1].lower()
    if ext not in config.ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format '{ext}'.",
        )

    try:
        logger.info(f"Transcribing: {file.filename} ({file_size / 1024:.1f} KB)")
        transcript, segments = app.state.whisper.transcribe(content, file.filename or "audio.wav")
        if not transcript.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Transcription produced no output. Check audio quality.",
            )
        logger.info(f"Transcribed {len(transcript)} chars, {len(segments)} segments")
        return TranscribeResponse(transcript=transcript, segments=segments)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


@app.post("/generate-soap", response_model=GenerateSoapResponse)
def generate_soap_endpoint(request: GenerateSoapRequest):
    diarized_text = "\n".join(
        f"{seg.speaker}: {seg.text}"
        for seg in request.segments
    ) if request.segments else request.transcript

    prompt = (
        f"Specialty: {request.specialty}\n\n"
        f"Consultation Transcript:\n{diarized_text}\n\n"
        "Generate the SOAP note JSON now."
    )

    raw = None

    # Primary: Flowise SOAP LLMChain flow
    if config.SOAP_FLOW_ID:
        try:
            logger.info("Generating SOAP note via Flowise — flow=%s specialty=%s", config.SOAP_FLOW_ID, request.specialty)
            result = app.state.flowise.predict(config.SOAP_FLOW_ID, prompt)
            # LLMChain returns {"text": "..."}
            raw = result.get("text") or result.get("output") or result.get("answer") or ""
            if raw:
                logger.info("SOAP generated via Flowise (%d chars)", len(raw))
        except Exception as fe:
            logger.warning("Flowise SOAP generation failed (%s) — falling back to direct Ollama", fe)
            raw = None

    # Fallback: direct Ollama call
    if not raw:
        try:
            logger.info("Generating SOAP note via direct Ollama — model=%s specialty=%s", config.OLLAMA_MODEL, request.specialty)
            raw = llm_generate_soap(prompt)
        except Exception as e:
            logger.error("SOAP generation error: %s", e, exc_info=True)
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    try:
        soap, keywords = _parse_soap_json(raw)
        logger.info("SOAP note generated — symptoms=%d medications=%d diagnoses=%d",
                    len(keywords.symptoms), len(keywords.medications), len(keywords.diagnoses))
        return GenerateSoapResponse(soap=soap, keywords=keywords, specialty=request.specialty, raw_response=raw)
    except Exception as e:
        logger.error("SOAP parse error: %s", e, exc_info=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


def _coerce_str(value, _depth: int = 0) -> str:
    """Normalise a value that may be a str, list, or dict into a readable plain string."""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [_coerce_str(v, _depth + 1) for v in value if v not in (None, "", [], {})]
        if _depth == 0:
            # Top-level list → join as sentences
            return " ".join(p.rstrip(".") + "." for p in parts if p).strip()
        return ", ".join(p for p in parts if p)
    if isinstance(value, dict):
        # Try common clinical key patterns for readable output
        parts = []
        # Render key: value pairs, skipping empty values
        for k, v in value.items():
            coerced = _coerce_str(v, _depth + 1)
            if not coerced:
                continue
            # Use readable key names
            key_label = k.replace("_", " ").strip()
            if key_label in ("description", "text", "name", "diagnosis", "finding"):
                # Lead with the main value, no key prefix
                parts.insert(0, coerced)
            elif key_label in ("differential diagnoses", "referrals", "treatment", "follow up",
                               "medications", "history", "symptoms", "tests ordered"):
                # Skip empty sub-lists
                if coerced and coerced not in (".", ""):
                    parts.append(coerced)
            else:
                parts.append(f"{key_label}: {coerced}")
        return " ".join(parts).strip()
    return str(value).strip() if value else ""


def _strip_inline_sources(text: str) -> str:
    """
    Remove inline [Source: ...] tags the LLM embeds in answers.
    The UI renders sources separately as citation boxes below the answer,
    so inline tags are redundant and visually messy.
    Handles: [Source: X], (Source: X), [Source: X, Y], **[Source: X]**
    """
    import re
    # Remove markdown-bold wrapped variants first
    text = re.sub(r'\*+\[Source:[^\]]*\]\*+', '', text, flags=re.IGNORECASE)
    # Remove bracketed [Source: ...]
    text = re.sub(r'\[Source:[^\]]*\]', '', text, flags=re.IGNORECASE)
    # Remove parenthesised (Source: ...)
    text = re.sub(r'\(Source:[^)]*\)', '', text, flags=re.IGNORECASE)
    # Remove "Refer to ..." trailing citations
    text = re.sub(r'\(Refer to [^)]*\)', '', text, flags=re.IGNORECASE)
    return text.strip()


def _strip_fences(raw: str) -> str:
    """Remove markdown code fences from LLM output."""
    text = raw.strip()
    if not text.startswith("```"):
        return text
    # Remove opening fence + optional language tag (e.g. ```json)
    lines = text.splitlines()
    # Drop first line (the opening fence)
    lines = lines[1:]
    # Drop last line if it's a closing fence
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _parse_soap_json(raw: str) -> tuple[SoapNote, SoapKeywords]:
    """
    Parse raw LLM output into a (SoapNote, SoapKeywords) tuple.
    Strips markdown fences if the model wraps its response despite instructions.
    Coerces array/dict fields to strings (llama3.2 sometimes returns arrays for list-like fields).
    Falls back to SoapNote(subjective=raw) with empty keywords on parse failure.
    """
    try:
        cleaned = _strip_fences(raw)
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            data = json.loads(cleaned[start:end])
            soap = SoapNote(
                chief_complaint=_coerce_str(data.get("chief_complaint", "")),
                subjective=_coerce_str(data.get("subjective", "")),
                objective=_coerce_str(data.get("objective", "")),
                assessment=_coerce_str(data.get("assessment", data.get("assessment", ""))),
                plan=_coerce_str(data.get("plan", "")),
            )
            raw_kw = data.get("keywords", {})
            if isinstance(raw_kw, dict):
                keywords = SoapKeywords(
                    symptoms=[str(s) for s in raw_kw.get("symptoms", []) if s],
                    medications=[str(m) for m in raw_kw.get("medications", []) if m],
                    diagnoses=[str(d) for d in raw_kw.get("diagnoses", []) if d],
                )
            else:
                keywords = SoapKeywords()
            return soap, keywords
    except Exception as e:
        logger.warning("SOAP JSON parse failed: %s — using raw text as subjective", e)
    return SoapNote(subjective=raw), SoapKeywords()


def _parse_billing_json(raw: str) -> BillingCodesResponse:
    """
    Parse raw LLM output into BillingCodesResponse.
    Strips markdown fences and extracts the first JSON object found.
    """
    try:
        cleaned = _strip_fences(raw)
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            data = json.loads(cleaned[start:end])
            cpt = [BillingCode(code=c["code"], description=c["description"]) for c in data.get("cpt", []) if "code" in c]
            icd10 = [BillingCode(code=c["code"], description=c["description"]) for c in data.get("icd10", []) if "code" in c]
            return BillingCodesResponse(cpt=cpt, icd10=icd10)
    except Exception as e:
        logger.warning("Billing JSON parse failed: %s", e)
    return BillingCodesResponse()


@app.post("/generate-billing", response_model=BillingCodesResponse)
def generate_billing_endpoint(request: GenerateBillingRequest):
    """
    Generate ICD-10 and CPT billing codes from an approved SOAP note.
    Called after the clinician has reviewed the SOAP note — not during generation.
    Returns 1-3 CPT codes (E&M / procedures) and 1-3 ICD-10 codes (diagnoses).
    All codes are AI suggestions only and must be verified by a qualified medical coder.
    """
    soap_text = (
        f"Specialty: {request.specialty}\n\n"
        f"Chief Complaint: {request.soap.chief_complaint}\n"
        f"Subjective: {request.soap.subjective}\n"
        f"Objective: {request.soap.objective}\n"
        f"Assessment: {request.soap.assessment}\n"
        f"Plan: {request.soap.plan}"
    )

    try:
        logger.info("Generating billing codes — model=%s, specialty=%s", config.OLLAMA_MODEL, request.specialty)
        raw = llm_generate_billing_codes(soap_text)
        result = _parse_billing_json(raw)
        logger.info("Billing codes generated — CPT=%d ICD-10=%d", len(result.cpt), len(result.icd10))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Billing code generation error: %s", e, exc_info=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


@app.post("/approve-note", response_model=ApproveNoteResponse)
def approve_note(request: ApproveNoteRequest):
    doc_id = str(uuid.uuid4())
    patient_label = request.patient_ref or "Anonymous"

    soap_text = (
        f"SOAP Note\n"
        f"Patient Reference: {patient_label}\n"
        f"Specialty: {request.specialty}\n\n"
        f"Chief Complaint:\n{request.soap.chief_complaint}\n\n"
        f"Subjective:\n{request.soap.subjective}\n\n"
        f"Objective:\n{request.soap.objective}\n\n"
        f"Assessment:\n{request.soap.assessment}\n\n"
        f"Plan:\n{request.soap.plan}"
    )

    # Append keywords if provided
    if request.keywords:
        kw = request.keywords
        if kw.symptoms or kw.medications or kw.diagnoses:
            soap_text += (
                f"\n\nKeywords:\n"
                f"Symptoms: {', '.join(kw.symptoms)}\n"
                f"Medications: {', '.join(kw.medications)}\n"
                f"Diagnoses: {', '.join(kw.diagnoses)}"
            )

    # Append billing codes if provided — makes ICD/CPT searchable in Clinical QA
    if request.billing:
        icd_lines = "\n".join(f"  {c.code} — {c.description}" for c in request.billing.icd10)
        cpt_lines = "\n".join(f"  {c.code} — {c.description}" for c in request.billing.cpt)
        soap_text += (
            f"\n\nBilling Codes:\n"
            f"ICD-10 Diagnoses:\n{icd_lines}\n"
            f"CPT Procedures:\n{cpt_lines}"
        )

    metadata = {
        "doc_type": "soap_note",
        "doc_id": doc_id,
        "patient_ref": request.patient_ref or "Anonymous",
        "specialty": request.specialty,
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        logger.info(f"Ingesting approved SOAP note — patient_ref={request.patient_ref}, specialty={request.specialty}")

        # Always use direct ChromaDB client for reliable upserts
        upsert_document(soap_text, metadata)
        logger.info("SOAP note upserted via direct ChromaDB client")

        _documents_store.append(
            DocumentRecord(
                id=doc_id,
                filename=f"SOAP_{request.specialty}_{request.patient_ref or 'anon'}.txt",
                size_bytes=len(soap_text.encode()),
                ingested_at=datetime.now(timezone.utc).isoformat(),
                doc_type="soap_note",
                patient_ref=request.patient_ref or "",
                specialty=request.specialty,
            )
        )
        logger.info(f"SOAP note ingested into knowledge base: {doc_id}")
        return ApproveNoteResponse(
            message="SOAP note approved and added to knowledge base.",
            document_id=doc_id,
            status="success",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Approve note error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


@app.post("/chat", response_model=ChatResponse)
def clinical_chat(request: ChatRequest):
    """
    Clinical QA — Flowise ConversationalRetrievalQAChain (primary) reading from the
    shared clinical_kb ChromaDB collection.

    All reads and writes use the direct Python chromadb client for consistent embeddings.
    Fallback to direct RAG if the primary path fails.
    """
    session_id = request.session_id or str(uuid.uuid4())

    # Direct ChromaDB + Ollama RAG
    # All reads and writes go through the Python chromadb client to keep embeddings consistent.
    try:
        logger.info("Clinical QA via direct RAG — session=%s question=%s", session_id, request.question[:80])
        retrieved = query_documents(request.question, n_results=8)

        if retrieved:
            context = "\n\n---\n\n".join(
                f"[Source: {r['metadata'].get('patient_ref') or r['metadata'].get('source', 'Unknown')} "
                f"({r['metadata'].get('doc_type', 'document')})]\n{r['text']}"
                for r in retrieved
            )
            answer = _strip_inline_sources(llm_answer_question(context, request.question))

            # If the LLM issued a refusal (non-medical or not in KB), show no citations —
            # the retrieved docs were not actually used to form the answer.
            _REFUSAL_PHRASES = (
                "this assistant only answers clinical",
                "no matching information found",
            )
            is_refusal = any(p in answer.lower() for p in _REFUSAL_PHRASES)
            sources = [] if is_refusal else [
                CitedSource(
                    document=r["metadata"].get("patient_ref") or r["metadata"].get("source", "Unknown"),
                    chunk=r["text"][:300],
                    doc_type=r["metadata"].get("doc_type", "guideline"),
                    score=r.get("score"),
                )
                for r in retrieved
            ]
        else:
            logger.info("Clinical QA — knowledge base is empty or no relevant documents found")
            answer = (
                "No matching information found in the knowledge base. "
                "Try approving relevant SOAP notes or uploading clinical guidelines."
            )
            sources = []

        return ChatResponse(answer=answer, sources=sources, session_id=session_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Clinical chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))


@app.post("/ingest-document", response_model=IngestDocumentResponse)
async def ingest_document(file: UploadFile = File(...)):
    content = await file.read()
    file_size = len(content)

    try:
        validate_pdf_file(file.filename or "doc.pdf", file_size)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        doc_id = str(uuid.uuid4())
        logger.info(f"Ingesting document: {file.filename} ({file_size / 1024:.1f} KB)")

        extracted_text = extract_text_from_pdf(tmp_path)
        if not extracted_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text could be extracted from this PDF.",
            )

        metadata = {
            "doc_type": "guideline",
            "doc_id": doc_id,
            "source": file.filename or "document.pdf",
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        }

        # Always use direct ChromaDB client for reliable upserts
        logger.info("Ingesting document via direct ChromaDB: %s", file.filename)
        upsert_document(extracted_text, metadata)

        _documents_store.append(
            DocumentRecord(
                id=doc_id,
                filename=file.filename or "document.pdf",
                size_bytes=file_size,
                ingested_at=datetime.now(timezone.utc).isoformat(),
                doc_type="guideline",
            )
        )

        logger.info(f"Document ingested into ChromaDB: {file.filename} → {doc_id}")
        return IngestDocumentResponse(
            message=f"'{file.filename}' ingested into knowledge base.",
            document_id=doc_id,
            status="success",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ingest error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


@app.get("/documents", response_model=DocumentsListResponse)
def list_documents():
    return DocumentsListResponse(documents=_documents_store, total=len(_documents_store))


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    global _documents_store
    before = len(_documents_store)
    _documents_store = [d for d in _documents_store if d.id != doc_id]
    if len(_documents_store) == before:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    chroma_delete_document(doc_id)
    logger.info(f"Document deleted: {doc_id}")
    return {"message": "Document removed.", "document_id": doc_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=config.BACKEND_PORT)  # nosec B104
