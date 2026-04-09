import json
import logging
from typing import Optional
import httpx
import config
from models import DiarizedSegment

logger = logging.getLogger(__name__)


class WhisperClient:
    def __init__(self):
        self.endpoint = config.WHISPER_ENDPOINT.rstrip("/")
        # Detect which server type based on endpoint
        # onerahmet/openai-whisper-asr-webservice uses /asr?output=json
        # whisper.cpp binary uses /inference
        self._is_asr_webservice = (
            "9000" in self.endpoint
            or "medivault-whisper" in self.endpoint
        )

    def transcribe(self, audio_bytes: bytes, filename: str) -> tuple[str, list[DiarizedSegment]]:
        if self._is_asr_webservice:
            return self._transcribe_asr_webservice(audio_bytes, filename)
        else:
            return self._transcribe_whisper_cpp(audio_bytes, filename)

    def _transcribe_asr_webservice(self, audio_bytes: bytes, filename: str) -> tuple[str, list[DiarizedSegment]]:
        """onerahmet/openai-whisper-asr-webservice — /asr endpoint with output=json."""
        url = f"{self.endpoint}/asr"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"
        mime_map = {
            "wav": "audio/wav", "mp3": "audio/mpeg", "m4a": "audio/mp4",
            "ogg": "audio/ogg", "webm": "audio/webm", "flac": "audio/flac",
        }
        mime = mime_map.get(ext, "audio/wav")

        # output=json returns segments with start/end times — needed for LLM diarization
        files = {"audio_file": (filename, audio_bytes, mime)}
        params = {"output": "json", "encode": "true", "task": "transcribe", "language": "en"}

        logger.info("Transcribing via whisper-asr-webservice: %s (%d bytes)", filename, len(audio_bytes))
        with httpx.Client(timeout=600.0) as client:
            response = client.post(url, files=files, params=params)
            response.raise_for_status()
            result = response.json()

        raw_segments = result.get("segments", [])
        full_text = result.get("text", "").strip()

        if raw_segments:
            segments = self._diarize_with_llm(raw_segments)
        else:
            segments = self._diarize_flat(full_text)

        return full_text, segments

    def _transcribe_whisper_cpp(self, audio_bytes: bytes, filename: str) -> tuple[str, list[DiarizedSegment]]:
        """whisper.cpp server binary — /inference endpoint."""
        url = f"{self.endpoint}/inference"
        files = {"file": (filename, audio_bytes, "audio/wav")}
        data = {"response_format": "verbose_json"}

        logger.info("Transcribing via whisper.cpp: %s (%d bytes)", filename, len(audio_bytes))
        with httpx.Client(timeout=600.0) as client:
            response = client.post(url, files=files, data=data)
            response.raise_for_status()
            result = response.json()

        raw_segments = result.get("segments", [])
        full_text = result.get("text", "").strip()

        if raw_segments:
            segments = self._diarize_with_llm(raw_segments)
        else:
            segments = self._diarize_flat(full_text)

        return full_text, segments

    def _diarize_with_llm(self, raw_segments: list[dict]) -> list[DiarizedSegment]:
        """
        Format segments as numbered timestamped entries for LLM diarization
        and send all at once to the LLM.

        The LLM returns utterances with speaker, combined text, and start timestamp.
        Falls back to gap-heuristic if LLM fails.
        """
        valid_segs = [s for s in raw_segments if s.get("text", "").strip()]
        if not valid_segs:
            full_text = " ".join(s.get("text", "") for s in raw_segments)
            return self._diarize_flat(full_text)

        from services.llm_client import diarize_segments as llm_diarize

        lines = []
        for idx, seg in enumerate(valid_segs):
            start = float(seg.get("start", 0.0))
            text  = seg["text"].strip()
            lines.append(f"[ID: {idx}] (Start: {start:.1f}s): {text}")

        segments_text = "\n".join(lines)
        logger.info("LLM diarization: %d segments", len(valid_segs))

        try:
            raw_json = llm_diarize(segments_text)

            # Strip markdown fences if model wraps output
            cleaned = raw_json.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```", 2)[-1] if cleaned.count("```") >= 2 else cleaned
                if "\n" in cleaned:
                    cleaned = cleaned.split("\n", 1)[1]
                cleaned = cleaned.rstrip("`").strip()

            # Extract JSON array
            start_idx = cleaned.find("[")
            end_idx = cleaned.rfind("]")
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                cleaned = cleaned[start_idx: end_idx + 1]

            utterances = json.loads(cleaned)
            if not isinstance(utterances, list):
                raise ValueError("Expected JSON array")

            all_turns: list[DiarizedSegment] = []
            for utt in utterances:
                speaker = utt.get("speaker", "")
                text    = utt.get("text", "").strip()
                start_s = float(utt.get("start", 0.0))
                if speaker in ("Doctor", "Patient") and text:
                    all_turns.append(DiarizedSegment(
                        speaker=speaker,
                        text=text,
                        start_ms=int(start_s * 1000),
                    ))

            if all_turns:
                all_turns = self._correct_diarization(all_turns)
                logger.info("LLM diarization complete: %d turns", len(all_turns))
                return all_turns

            raise ValueError("LLM returned empty utterances list")

        except Exception as exc:
            logger.warning("LLM diarization failed (%s) — falling back to gap-heuristic", exc)
            return self._diarize_gap(raw_segments)

    def _correct_diarization(self, turns: list[DiarizedSegment]) -> list[DiarizedSegment]:
        """
        Post-processing: only enforce that Doctor speaks first.
        If the LLM assigned Patient to turn 0, swap ALL speakers globally.
        No run-length correction — consecutive same-speaker turns are valid
        (e.g. doctor narrating exam findings across multiple turns).
        """
        if not turns:
            return turns

        if turns[0].speaker == "Patient":
            logger.info("Diarization correction: turn 0 was Patient — swapping all speakers")
            opposite = {"Doctor": "Patient", "Patient": "Doctor"}
            turns = [
                DiarizedSegment(speaker=opposite[t.speaker], text=t.text, start_ms=t.start_ms)
                for t in turns
            ]

        return turns

    def _diarize_gap(self, raw_segments: list[dict]) -> list[DiarizedSegment]:
        """
        Gap-heuristic fallback diarization.
        Assigns speakers based on silence gaps (>1200 ms = speaker change).
        Used only when LLM diarization fails.
        """
        diarized = []
        current_speaker: Optional[str] = None
        last_end_ms = 0

        for seg in raw_segments:
            start_ms = int(seg.get("start", 0) * 1000)
            end_ms   = int(seg.get("end",   0) * 1000)
            text     = seg.get("text", "").strip()

            if not text:
                last_end_ms = end_ms
                continue

            text_lower = text.lower()
            if text_lower.startswith("doctor") or text_lower.startswith("(speaker ?) doctor"):
                current_speaker = "Doctor"
                for prefix in ["(speaker ?) doctor,", "(speaker ?) doctor:", "doctor,", "doctor:"]:
                    if text_lower.startswith(prefix):
                        text = text[len(prefix):].strip()
                        break
            elif text_lower.startswith("patient") or text_lower.startswith("(speaker ?) patient"):
                current_speaker = "Patient"
                for prefix in ["(speaker ?) patient,", "(speaker ?) patient:", "patient,", "patient:"]:
                    if text_lower.startswith(prefix):
                        text = text[len(prefix):].strip()
                        break
            else:
                gap_ms = start_ms - last_end_ms
                if current_speaker is None:
                    current_speaker = "Doctor"
                elif gap_ms > 1200:
                    current_speaker = "Patient" if current_speaker == "Doctor" else "Doctor"

            if text:
                diarized.append(DiarizedSegment(
                    speaker=current_speaker,
                    text=text,
                    start_ms=start_ms,
                ))
            last_end_ms = end_ms

        return diarized if diarized else self._diarize_flat(
            " ".join(s.get("text", "") for s in raw_segments)
        )

    def _diarize_flat(self, text: str) -> list[DiarizedSegment]:
        """Last-resort fallback: split full transcript into alternating speaker turns by sentence."""
        if not text.strip():
            return []
        sentences = [s.strip() for s in text.replace("?", "?.").replace("!", "!.").split(".") if s.strip()]
        segments = []
        speaker = "Doctor"
        for i, sentence in enumerate(sentences):
            segments.append(DiarizedSegment(speaker=speaker, text=sentence, start_ms=i * 3000))
            if i % 2 == 1:
                speaker = "Patient" if speaker == "Doctor" else "Doctor"
        return segments

    def is_connected(self) -> bool:
        try:
            with httpx.Client(timeout=5.0) as client:
                # asr-webservice: GET / returns 200 with API info
                # whisper.cpp: GET /health returns 200
                check_url = self.endpoint + ("/" if self._is_asr_webservice else "/health")
                response = client.get(check_url, follow_redirects=True)
                return response.status_code in (200, 404)  # 404 on /health is still "server up"
        except Exception:
            return False


_whisper_client: Optional[WhisperClient] = None


def get_whisper_client() -> WhisperClient:
    global _whisper_client
    if _whisper_client is None:
        _whisper_client = WhisperClient()
    return _whisper_client
