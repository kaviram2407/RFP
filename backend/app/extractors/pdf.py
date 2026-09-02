import fitz  # PyMuPDF
from typing import List
from fastapi import HTTPException, status

from app.extractors.base import BaseExtractor, ExtractedBlock, ExtractedDocument, SourceTypeEnum
from app.extractors.normalizer import normalize_text, build_full_text

class PDFExtractor(BaseExtractor):
    def extract(self, file_bytes: bytes) -> ExtractedDocument:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to parse PDF document: {str(e)}"
            )

        blocks: List[ExtractedBlock] = []
        seq_num = 1
        page_count = len(doc)

        for page_idx in range(page_count):
            page_num = page_idx + 1
            page = doc.load_page(page_idx)
            
            # Extract structured text blocks with reading order sorting
            page_blocks = page.get_text("blocks", sort=True)
            for b in page_blocks:
                # b format: (x0, y0, x1, y1, "text", block_no, block_type)
                if len(b) >= 5:
                    raw_text = b[4]
                    norm_text = normalize_text(raw_text)
                    if norm_text:
                        bbox = [round(b[0], 2), round(b[1], 2), round(b[2], 2), round(b[3], 2)] if len(b) >= 4 else None
                        block_no = b[5] if len(b) >= 6 else None
                        blocks.append(
                            ExtractedBlock(
                                sequence_number=seq_num,
                                source_type=SourceTypeEnum.PAGE,
                                source_index=page_num,
                                text=norm_text,
                                metadata_json={
                                    "page_number": page_num,
                                    "block_number": block_no,
                                    "bbox": bbox
                                }
                            )
                        )
                        seq_num += 1

        doc.close()

        if not blocks:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="PDF contains no extractable text content (may be scanned image without OCR)."
            )

        full_text = build_full_text(blocks)
        return ExtractedDocument(
            full_text=full_text,
            blocks=blocks,
            source_unit_count=page_count,
            character_count=len(full_text)
        )
