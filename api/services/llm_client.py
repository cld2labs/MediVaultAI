"""
llm_client.py
Ollama client for SOAP note generation, speaker diarization, billing code suggestion,
clinical QA, and text embedding.

Ollama runs on the host machine and is reachable from Docker containers
via host.docker.internal.
"""

import json
import logging

import httpx

import config

logger = logging.getLogger(__name__)

# ── Timeouts ────────────────────────────────────────────────────────────────
_CHAT_TIMEOUT  = 600.0   # seconds — 10 min budget for llama3.1:8b on CPU (2-3 min per call)
_EMBED_TIMEOUT = 30.0

# ── System prompts ──────────────────────────────────────────────────────────

SOAP_SYSTEM_PROMPT = """\
You are a clinical documentation specialist.
You will receive a diarized doctor-patient consultation transcript
where speakers are labeled Doctor and Patient.

Generate a structured SOAP note as valid JSON with EXACTLY these keys:
  chief_complaint, subjective, objective, assessment, plan, keywords

STRICT OUTPUT RULES — read carefully:
- Every field except keywords MUST be a plain STRING (not an object, not an array).
- Write each field as flowing prose sentences, NOT as JSON sub-objects or lists.
- keywords MUST be an object with three flat string arrays.

STRICT CONTENT RULES:
- Use ONLY information explicitly stated in the transcript. Do not invent vitals, medications, or findings not mentioned.
- If objective findings (BP, exam results) were not mentioned in the transcript, write "Not documented in this consultation."
- If a field has no information from the transcript, write "Not reported."

OUTPUT FORMAT — return valid JSON matching this exact structure:
{
  "chief_complaint": "One sentence summarising the patient's main complaint from the transcript.",
  "subjective": "Prose paragraph summarising what the patient reported: symptoms, duration, severity, history.",
  "objective": "Prose paragraph of clinician findings from the transcript: vitals, exam findings, test results. If none mentioned, write: Not documented in this consultation.",
  "assessment": "Prose paragraph with clinical impression and differential diagnoses with ICD-10 codes where applicable.",
  "plan": "Prose paragraph with treatment, tests ordered, medications, and follow-up instructions.",
  "keywords": {
    "symptoms": ["list", "of", "symptoms"],
    "medications": ["list", "of", "medications"],
    "diagnoses": ["list", "of", "diagnoses"]
  }
}

Use proper medical terminology. Return ONLY valid JSON — no markdown fences, no explanation."""


BILLING_SYSTEM_PROMPT = """\
You are an expert medical coder. Review the provided SOAP note and suggest
1-3 appropriate CPT codes (procedures/E&M visits) and 1-3 ICD-10 codes (diagnoses).

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "cpt":   [{"code": "string", "description": "string"}],
  "icd10": [{"code": "string", "description": "string"}]
}"""


QA_SYSTEM_PROMPT = """\
You are a clinical knowledge base assistant. You answer ONLY from the retrieved context provided.

Rules:
- If the question is not clinical or medical, respond exactly: "This assistant only answers clinical and medical questions from the knowledge base."
- If the answer is not present in the context, respond exactly: "No matching information found in the knowledge base. Try approving relevant SOAP notes or uploading clinical guidelines."
- Never use outside knowledge. If context does not contain the answer, use the fallback above.
- Give a direct, factual answer in 1-3 sentences. No preamble, no apologies, no "unfortunately".
- Do not include source tags in your answer — sources are shown separately."""


DIARIZATION_SYSTEM_PROMPT = """\
You are a medical AI assistant. You are given a transcript of a clinical visit broken into numbered audio segments.

Reconstruct the dialogue: determine if each segment is spoken by the "Doctor" or "Patient" based on context.
Combine adjacent segments from the same speaker into a single utterance.

Rules:
- The Doctor always speaks first (greeting/opening).
- Doctor: greetings, clinical questions, exam findings (BP, heart sounds), diagnoses, test orders, instructions.
- Patient: symptom descriptions, answering questions, personal/family history, own medications, concern/worry.
- Combine consecutive segments from the same speaker into one utterance with combined text.
- Use the start time of the first segment in each combined group as the utterance start.

You MUST respond with ONLY a valid JSON array — no markdown, no explanation:
[{"speaker": "Doctor"|"Patient", "text": "combined text of all segments in this turn", "start": 0.0}]"""


# ── Public API ──────────────────────────────────────────────────────────────

def generate_soap(transcript: str) -> str:
    """
    Generate a SOAP note JSON string from a diarized transcript.
    Returns raw JSON string. Raises on failure.
    """
    logger.info("Generating SOAP note via Ollama model=%s", config.OLLAMA_MODEL)
    return _chat(transcript, SOAP_SYSTEM_PROMPT)


def generate_billing_codes(soap_json: str) -> str:
    """
    Generate ICD-10 and CPT codes from a SOAP note JSON string.
    Returns raw JSON string. Raises on failure.
    """
    logger.info("Generating billing codes via Ollama model=%s", config.OLLAMA_MODEL)
    return _chat(soap_json, BILLING_SYSTEM_PROMPT)


def answer_question(context: str, question: str) -> str:
    """
    Answer a clinical question using retrieved context from the knowledge base.
    Returns the answer string. Raises on failure.
    """
    logger.info("Answering clinical question via Ollama model=%s", config.OLLAMA_MODEL)
    user_message = f"Context from knowledge base:\n\n{context}\n\nQuestion: {question}"
    return _chat(user_message, QA_SYSTEM_PROMPT)


def diarize_segments(segments_text: str) -> str:
    """
    Classify Whisper segments into Doctor/Patient turns.
    segments_text: formatted string of numbered segments.
    Returns raw JSON array string. Raises on failure.
    Uses num_predict=1024 to prevent truncation of the JSON array output.
    """
    logger.info("Diarizing segments via Ollama model=%s", config.OLLAMA_MODEL)
    return _chat(segments_text, DIARIZATION_SYSTEM_PROMPT, num_predict=1024)


def embed(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings via Ollama embeddings endpoint.
    Returns list of float vectors, one per input text.
    """
    url = f"{config.OLLAMA_BASE_URL}/api/embed"
    payload = {"model": config.OLLAMA_EMBED_MODEL, "input": texts}
    with httpx.Client(timeout=_EMBED_TIMEOUT) as client:
        r = client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        # Ollama /api/embed returns {"embeddings": [[...]]}
        return data["embeddings"]


# ── Internal ────────────────────────────────────────────────────────────────

def _chat(user_message: str, system_prompt: str, num_predict: int = -1) -> str:
    """
    Call Ollama /api/chat (non-streaming) and return the assistant content string.
    num_predict: max tokens to generate. -1 = model default (unlimited).
    """
    url = f"{config.OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": num_predict},
        "messages": [
            {"role": "system",  "content": system_prompt},
            {"role": "user",    "content": user_message},
        ],
    }
    with httpx.Client(timeout=_CHAT_TIMEOUT) as client:
        r = client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        content = data.get("message", {}).get("content", "")
        if not content:
            raise ValueError("Ollama returned empty content")
        return content
