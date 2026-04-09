import os
import config


def validate_pdf_file(filename: str, file_size: int, max_size: int = None) -> None:
    if max_size is None:
        max_size = config.MAX_FILE_SIZE
    ext = os.path.splitext(filename)[1].lower()
    if ext not in config.ALLOWED_PDF_EXTENSIONS:
        raise ValueError(f"Invalid file type '{ext}'. Only PDF files are accepted.")
    if file_size > max_size:
        raise ValueError(
            f"File too large ({file_size / 1024 / 1024:.1f} MB). "
            f"Maximum allowed size is {max_size / 1024 / 1024:.0f} MB."
        )


def extract_text_from_pdf(file_path: str) -> str:
    from pypdf import PdfReader
    reader = PdfReader(file_path)
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return "\n\n".join(pages)
