# Troubleshooting Guide

This document contains all common issues encountered during development and their solutions.

## Table of Contents

- [API Common Issues](#api-common-issues)
- [UI Common Issues](#ui-common-issues)

### API Common Issues

#### Flowise shows `connecting` or `flowise_connected: false`

**Solution**:

1. Wait up to 30 seconds after `docker compose up` — Flowise requires time to initialise before flows can be provisioned
2. Verify the Flowise container is running: `docker compose ps`
3. Check the API provisioning log: `docker compose logs medivault-api | grep -i "provision\|flowise\|error"`
4. If `FLOWISE_API_KEY` is set in `.env`, confirm the key matches one generated in the Flowise UI at `http://localhost:3001` — an incorrect key causes all provisioning calls to return 401
5. Restart the API after correcting the key: `docker compose restart medivault-api`

#### Whisper shows `whisper_connected: false`

**Solution**:

1. On first startup the Whisper container downloads the `small` model (~500 MB) — allow up to 5 minutes and monitor progress: `docker compose logs -f medivault-whisper`
2. Confirm the container is running: `docker compose ps medivault-whisper`
3. Verify the Whisper endpoint is reachable from the host: `curl http://localhost:9000/health`
4. If the container exited, inspect the logs and restart: `docker compose restart medivault-whisper`

#### Transcription returns empty or fails

**Solution**:

1. Confirm the Whisper service is healthy before submitting audio
2. Verify the audio file plays correctly on the host machine before uploading
3. Ensure the file is WAV or MP3 and does not exceed 25 MB
4. If using a non-standard codec, convert to WAV before uploading:
   ```bash
   ffmpeg -i input.m4a -ar 16000 -ac 1 output.wav
   ```
5. Check the API logs for the specific error: `docker compose logs medivault-api | grep -i "transcri\|whisper\|error"`

#### SOAP generation fails or returns malformed JSON

**Solution**:

1. Confirm `/health` reports `flowise_connected: true` and `flows_provisioned: true`: `curl http://localhost:5001/health`
2. Verify Ollama is running and the model is available: `ollama list`
3. Test Ollama directly: `curl http://localhost:11434/api/tags`
4. If Flowise flows are missing, restart the API to re-trigger provisioning: `docker compose restart medivault-api`
5. Inspect the Flowise SOAP Generator flow at `http://localhost:3001` and confirm the `ChatOllama` node base URL is `http://host.docker.internal:11434`

#### No matching information in Clinical QA after approving notes

**Solution**:

1. Confirm `nomic-embed-text` is pulled: `ollama list`
2. Pull the model if missing: `ollama pull nomic-embed-text`
3. Verify the approve operation succeeded by checking the API logs: `docker compose logs medivault-api | grep -i "approve\|chroma\|embed\|error"`
4. Confirm ChromaDB is reachable and the collection exists: `curl http://localhost:8100/api/v1/collections`
5. Re-approve the note after confirming Ollama and ChromaDB are both healthy

#### Billing codes not appearing

**Solution**:

1. Confirm a complete SOAP note with all sections populated was submitted before requesting billing codes
2. Check the API logs for the billing request: `docker compose logs medivault-api | grep -i "billing\|icd\|cpt\|error"`
3. Verify Ollama is responsive: `curl http://localhost:11434/api/tags`
4. If Ollama is slow on CPU hardware, wait for the previous LLM call to complete before submitting the billing request — concurrent requests may time out

#### PDF ingestion fails

**Solution**:

1. Confirm the file is under 10 MB
2. Verify the PDF contains a text layer: `pdftotext document.pdf -`
3. If the output is empty, the PDF is image-only — run OCR before ingesting: `ocrmypdf input.pdf output.pdf`
4. Check the API logs for the rejection reason: `docker compose logs medivault-api | grep -i "ingest\|pdf\|error"`

#### ChromaDB connection errors

**Solution**:

1. Confirm ChromaDB is running: `docker compose ps medivault-chromadb`
2. Verify ChromaDB responds: `curl http://localhost:8100/api/v1/heartbeat`
3. Confirm `CHROMA_HOST` is set to `medivault-chromadb` and `CHROMA_PORT` to `8000` in `.env` — the backend communicates on the internal Docker network port, not 8100
4. Restart ChromaDB if the container exited: `docker compose restart medivault-chromadb`

#### Ollama not responding

**Solution**:

1. Verify Ollama is running on the host: `ollama list` and `curl http://localhost:11434/api/tags`
2. Start Ollama if it is not running: `ollama serve`
3. Confirm the required models are pulled:
   ```bash
   ollama pull llama3.1:8b
   ollama pull nomic-embed-text
   ```
4. On Linux, confirm `extra_hosts` is present in `docker-compose.yaml` for services that need to reach the host:
   ```yaml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```
5. Confirm `OLLAMA_BASE_URL` in `.env` is set to `http://host.docker.internal:11434`

#### Import errors or server won't start

**Solution**:

1. Ensure all dependencies are installed: `pip install -r requirements.txt`
2. Verify you are using Python 3.11 or higher: `python --version`
3. Activate your virtual environment if using one
4. Check if port 5001 is already in use: `lsof -i :5001` (Unix) or `netstat -ano | findstr :5001` (Windows)
5. Use a different port by updating `BACKEND_PORT` in `.env`

## UI Common Issues

### API Connection Issues

**Problem**: "Failed to transcribe", "Failed to generate SOAP note", or API shows offline

**Solution**:

1. Ensure the API server is running on `http://localhost:5001`
2. Check browser console for detailed errors
3. Verify CORS is enabled in the API
4. Test API directly: `curl http://localhost:5001/health`

### Build Issues

**Problem**: Build fails with dependency errors

**Solution**:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Styling Issues

**Problem**: Styles not applying

**Solution**:

```bash
# Rebuild Tailwind CSS
npm run dev
```

### UI Shows Blank Page

**Problem**: Blank page on load or UI container shows errors

**Solution**:

1. Check the UI container logs: `docker compose logs medivault-ui`
2. Check the API container logs: `docker compose logs medivault-api`
3. Rebuild the UI container: `docker compose up --build medivault-ui`
4. Confirm the API is reachable: `curl http://localhost:5001/health`
