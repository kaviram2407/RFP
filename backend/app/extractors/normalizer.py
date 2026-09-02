import re
from typing import List
from app.extractors.base import ExtractedBlock, SourceTypeEnum

def normalize_text(text: str) -> str:
    if not text:
        return ""
    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Replace tabs with spaces
    text = text.replace("\t", " ")
    # Replace 3 or more consecutive newlines with 2 newlines (preserve paragraph breaks)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Trim lines
    lines = [line.strip() for line in text.split("\n")]
    return "\n".join(lines).strip()

def build_full_text(blocks: List[ExtractedBlock]) -> str:
    full_parts = []
    current_unit = None
    current_type = None

    for block in blocks:
        # Append structural header when source index changes
        if block.source_index != current_unit or block.source_type != current_type:
            current_unit = block.source_index
            current_type = block.source_type
            if block.source_type == SourceTypeEnum.PAGE:
                full_parts.append(f"\n\n--- [PAGE {block.source_index}] ---\n")
            elif block.source_type == SourceTypeEnum.SHEET:
                sheet_name = (block.metadata_json or {}).get("sheet_name", f"Sheet {block.source_index}")
                full_parts.append(f"\n\n--- [SHEET: {sheet_name}] ---\n")
            elif block.source_type == SourceTypeEnum.SLIDE:
                slide_title = (block.metadata_json or {}).get("slide_title", "")
                header = f"\n\n--- [SLIDE {block.source_index}]"
                if slide_title:
                    header += f": {slide_title}"
                header += " ---\n"
                full_parts.append(header)
            elif block.source_type == SourceTypeEnum.PARAGRAPH:
                if not full_parts:
                    full_parts.append(f"\n--- [DOCUMENT CONTENT] ---\n")

        if block.text and block.text.strip():
            full_parts.append(block.text.strip())

    return normalize_text("\n".join(full_parts))
