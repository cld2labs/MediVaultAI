from pydantic import BaseModel, Field
from typing import Optional, Literal


class DiarizedSegment(BaseModel):
    speaker: Literal["Doctor", "Patient"]
    text: str
    start_ms: int = 0


class TranscribeResponse(BaseModel):
    transcript: str
    segments: list[DiarizedSegment] = []


class SoapNote(BaseModel):
    chief_complaint: str = ""
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""


class SoapKeywords(BaseModel):
    symptoms: list[str] = []
    medications: list[str] = []
    diagnoses: list[str] = []


class BillingCode(BaseModel):
    code: str
    description: str


class BillingCodesResponse(BaseModel):
    cpt: list[BillingCode] = []
    icd10: list[BillingCode] = []


class GenerateBillingRequest(BaseModel):
    soap: SoapNote
    specialty: str = "general"


class GenerateSoapRequest(BaseModel):
    transcript: str = Field(..., min_length=1)
    segments: list[DiarizedSegment] = []
    specialty: str = Field(default="general")


class GenerateSoapResponse(BaseModel):
    soap: SoapNote
    keywords: SoapKeywords = Field(default_factory=SoapKeywords)
    specialty: str
    raw_response: Optional[str] = None


class ApproveNoteRequest(BaseModel):
    soap: SoapNote
    specialty: str = "general"
    patient_ref: str = ""
    billing: Optional[BillingCodesResponse] = None
    keywords: Optional[SoapKeywords] = None


class ApproveNoteResponse(BaseModel):
    message: str
    document_id: str
    status: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    session_id: Optional[str] = None


class CitedSource(BaseModel):
    document: str
    chunk: str
    doc_type: str = "guideline"
    score: Optional[float] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[CitedSource] = []
    session_id: Optional[str] = None


class IngestDocumentResponse(BaseModel):
    message: str
    document_id: str
    status: str


class DocumentRecord(BaseModel):
    id: str
    filename: str
    size_bytes: int
    ingested_at: str
    doc_type: str = "guideline"
    patient_ref: str = ""
    specialty: str = ""


class DocumentsListResponse(BaseModel):
    documents: list[DocumentRecord]
    total: int


class HealthResponse(BaseModel):
    status: str
    flowise_connected: bool
    whisper_connected: bool
    flows_provisioned: bool
    version: str
