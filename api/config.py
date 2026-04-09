import os
from dotenv import load_dotenv

load_dotenv()

# ── Flowise ────────────────────────────────────────────────────────────────
FLOWISE_ENDPOINT = os.getenv("FLOWISE_ENDPOINT", "http://medivault-flowise:3001")
FLOWISE_API_KEY  = os.getenv("FLOWISE_API_KEY", "")

SOAP_FLOW_ID   = os.getenv("SOAP_FLOW_ID", "")
QA_FLOW_ID     = os.getenv("QA_FLOW_ID", "")
UPSERT_FLOW_ID = os.getenv("UPSERT_FLOW_ID", "")

# ── Ollama ─────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL    = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL       = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

# ── ChromaDB ───────────────────────────────────────────────────────────────
CHROMA_HOST = os.getenv("CHROMA_HOST", "host.docker.internal")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8100"))

# ── Whisper ────────────────────────────────────────────────────────────────
WHISPER_ENDPOINT = os.getenv("WHISPER_ENDPOINT", "http://host.docker.internal:8080")

# ── Limits ─────────────────────────────────────────────────────────────────
MAX_AUDIO_SIZE = int(os.getenv("MAX_AUDIO_SIZE", str(50 * 1024 * 1024)))
MAX_FILE_SIZE  = int(os.getenv("MAX_FILE_SIZE",  str(10 * 1024 * 1024)))
BACKEND_PORT   = int(os.getenv("BACKEND_PORT", "5001"))

# ── App ────────────────────────────────────────────────────────────────────
CORS_ALLOW_ORIGINS      = ["*"]
CORS_ALLOW_CREDENTIALS  = True
CORS_ALLOW_METHODS      = ["*"]
CORS_ALLOW_HEADERS      = ["*"]

APP_TITLE       = "MediVault AI API"
APP_DESCRIPTION = "Offline clinical intelligence — SOAP note generation and clinical decision support"
APP_VERSION     = "2.0.0"

SUPPORTED_SPECIALTIES = [
    "general", "emergency", "cardiology", "pediatrics",
    "psychiatry", "orthopedics", "dermatology", "neurology",
    "oncology", "gastroenterology",
]

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac"}
ALLOWED_PDF_EXTENSIONS   = {".pdf"}

SOAP_FLOW_NAME   = "MediVault SOAP Generator"
QA_FLOW_NAME     = "MediVault Clinical QA"
UPSERT_FLOW_NAME = "MediVault KB Upsert"
