from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod

from app.models.rfp_document import SourceTypeEnum

@dataclass
class ExtractedBlock:
    sequence_number: int
    source_type: SourceTypeEnum
    source_index: int
    text: str
    metadata_json: Optional[Dict[str, Any]] = field(default_factory=dict)

@dataclass
class ExtractedDocument:
    full_text: str
    blocks: List[ExtractedBlock]
    source_unit_count: int
    character_count: int

class BaseExtractor(ABC):
    @abstractmethod
    def extract(self, file_bytes: bytes) -> ExtractedDocument:
        pass
