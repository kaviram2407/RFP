from fastapi import HTTPException, status
from app.models.rfp_document import DocumentTypeEnum
from app.extractors.base import BaseExtractor
from app.extractors.pdf import PDFExtractor
from app.extractors.docx import DOCXExtractor
from app.extractors.xlsx import XLSXExtractor
from app.extractors.pptx import PPTXExtractor

def get_extractor(doc_type: DocumentTypeEnum) -> BaseExtractor:
    if doc_type == DocumentTypeEnum.PDF:
        return PDFExtractor()
    elif doc_type == DocumentTypeEnum.DOCX:
        return DOCXExtractor()
    elif doc_type == DocumentTypeEnum.XLSX:
        return XLSXExtractor()
    elif doc_type == DocumentTypeEnum.PPTX:
        return PPTXExtractor()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No extractor available for document type '{doc_type}'."
        )
