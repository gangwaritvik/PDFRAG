import os  
import uuid  
from typing import List, Dict, Any

from langchain_community.document_loaders import PyMuPDFLoader  
from langchain_core.documents import Document  
from backend.utils.logger import get_logger

log = get_logger("document_loader")


class DocumentLoader:  
    def __init__(self, upload_dir: str = "uploads"):  
        self.upload_dir = upload_dir  
        os.makedirs(upload_dir, exist_ok=True)  
        log.info(f"DocumentLoader initialized — upload_dir: {upload_dir}")

    def save_file(self, filename: str, content: bytes) -> str:  
        safe_name = f"{uuid.uuid4().hex}_{filename}"  
        file_path = os.path.join(self.upload_dir, safe_name)  
        with open(file_path, "wb") as f:  
            f.write(content)  
        log.info(f"[SAVE] {filename} → {file_path} ({len(content)} bytes)")  
        return file_path

    def load_pdf(self, file_path: str, filename: str) -> Dict[str, Any]:  
        doc_id = uuid.uuid4().hex  
        log.info(f"[LOAD] Starting extraction — file: {filename} | doc_id: {doc_id}")

        try:  
            log.debug(f"[LOAD] Opening PDF with PyMuPDFLoader: {file_path}")  
            loader = PyMuPDFLoader(file_path)  
            pages: List[Document] = loader.load()  
            log.debug(f"[LOAD] Raw pages extracted: {len(pages)}")

            for page in pages:  
                page.metadata["doc_id"]   = doc_id  
                page.metadata["filename"] = filename  
                page.metadata["source"]   = filename  
                page.page_content         = self._clean(page.page_content)

            pages = [p for p in pages if p.page_content.strip()]  
            log.info(f"[LOAD] ✅ {filename} — {len(pages)} non-empty pages | {sum(len(p.page_content) for p in pages)} chars")

            return {  
                "doc_id":      doc_id,  
                "filename":    filename,  
                "total_pages": len(pages),  
                "total_chars": sum(len(p.page_content) for p in pages),  
                "documents":   pages,  
                "errors":      [],  
            }

        except Exception as e:  
            log.error(f"[LOAD] ❌ FAILED for {filename} — {type(e).__name__}: {e}", exc_info=True)  
            return {  
                "doc_id":      doc_id,  
                "filename":    filename,  
                "total_pages": 0,  
                "total_chars": 0,  
                "documents":   [],  
                "errors":      [str(e)],  
            }

    def load_documents(self, files: List[tuple]) -> List[Dict[str, Any]]:  
        log.info(f"[LOAD] Processing {len(files)} file(s)")  
        results = []  
        for filename, content in files:  
            log.debug(f"[LOAD] → {filename} ({len(content)} bytes)")  
            file_path = self.save_file(filename, content)  
            results.append(self.load_pdf(file_path, filename))  
        return results

    @staticmethod  
    def _clean(text: str) -> str:  
        lines = [l.strip() for l in text.splitlines() if l.strip()]  
        return " ".join(lines).strip()  
