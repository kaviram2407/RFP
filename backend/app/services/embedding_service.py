import httpx
from typing import List
from fastapi import HTTPException, status
import logging
import math
import hashlib

from app.core.config import settings

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        self.api_key = settings.NVIDIA_API_KEY
        self.base_url = settings.NVIDIA_BASE_URL.rstrip("/")
        self.model = settings.NVIDIA_EMBEDDING_MODEL
        self.expected_dim = settings.NVIDIA_EMBEDDING_DIMENSIONS  # 2048
        self.timeout = settings.LLM_REQUEST_TIMEOUT_SECONDS

    def get_embeddings(self, texts: List[str], input_type: str = "passage") -> List[List[float]]:
        """
        Generates 2048-dimensional float embeddings using NVIDIA NIM embedding service.
        input_type: 'passage' for indexing document chunks, 'query' for search queries.
        """
        if not texts:
            return []

        if not self.api_key or self.api_key == "your_nvidia_nim_api_key":
            logger.warning("NVIDIA_API_KEY is not configured. Falling back to deterministic pseudo-embedding generator.")
            return [self._generate_fallback_embedding(t) for t in texts]

        payload = {
            "model": self.model,
            "input": texts,
            "input_type": input_type,
            "encoding_format": "float"
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}/embeddings",
                    json=payload,
                    headers=headers
                )
                response.raise_for_status()
                data = response.json()
                embeddings = [item["embedding"] for item in data.get("data", [])]

                # Validate embedding dimensions
                for emb in embeddings:
                    if len(emb) != self.expected_dim:
                        raise ValueError(f"Received embedding dimension {len(emb)}, expected {self.expected_dim}.")

                return embeddings
        except Exception as e:
            logger.error(f"NVIDIA Embedding API call failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"NVIDIA Embedding generation failed: {str(e)}"
            )

    def _generate_fallback_embedding(self, text: str) -> List[float]:
        """
        Generates a deterministic unit-normalized 2048-dimensional vector based on text SHA256 seed.
        Used for reproducible testing when live NVIDIA API credentials are omitted.
        """
        vec = []
        # Create seed hash
        hash_bytes = hashlib.sha256(text.encode("utf-8")).digest()
        
        for i in range(self.expected_dim):
            # Compute pseudo-random values derived from text hash and index
            val = math.sin((i + 1) * (hash_bytes[i % 32] + 1))
            vec.append(val)

        # Unit normalize vector for cosine similarity math
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

embedding_service = EmbeddingService()
