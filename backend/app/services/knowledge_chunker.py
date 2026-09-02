import hashlib
from typing import List, Dict, Any

class ChunkResult:
    def __init__(self, chunk_index: int, content: str, character_count: int, content_hash: str, source_metadata: Dict[str, Any]):
        self.chunk_index = chunk_index
        self.content = content
        self.character_count = character_count
        self.content_hash = content_hash
        self.source_metadata = source_metadata

class KnowledgeChunker:
    def __init__(self, target_chunk_size: int = 1500, overlap_size: int = 200):
        self.target_chunk_size = target_chunk_size
        self.overlap_size = overlap_size

    def chunk_text(self, text: str, source_name: str = None) -> List[ChunkResult]:
        """
        Chunks text into structural paragraphs and bounded windows while preserving source metadata.
        """
        if not text or not text.strip():
            return []

        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks = []
        current_chunk_parts = []
        current_length = 0
        chunk_index = 1

        for p in paragraphs:
            p_len = len(p)
            if current_length + p_len > self.target_chunk_size and current_chunk_parts:
                combined_content = "\n\n".join(current_chunk_parts)
                c_hash = hashlib.sha256(combined_content.encode("utf-8")).hexdigest()
                chunks.append(ChunkResult(
                    chunk_index=chunk_index,
                    content=combined_content,
                    character_count=len(combined_content),
                    content_hash=c_hash,
                    source_metadata={"section": f"Chunk {chunk_index}", "source_name": source_name}
                ))
                chunk_index += 1
                current_chunk_parts = [p]
                current_length = p_len
            else:
                current_chunk_parts.append(p)
                current_length += p_len + 2

        if current_chunk_parts:
            combined_content = "\n\n".join(current_chunk_parts)
            c_hash = hashlib.sha256(combined_content.encode("utf-8")).hexdigest()
            chunks.append(ChunkResult(
                chunk_index=chunk_index,
                content=combined_content,
                character_count=len(combined_content),
                content_hash=c_hash,
                source_metadata={"section": f"Chunk {chunk_index}", "source_name": source_name}
            ))

        return chunks

knowledge_chunker = KnowledgeChunker()
