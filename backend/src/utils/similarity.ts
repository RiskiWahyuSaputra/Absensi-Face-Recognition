export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface StoredEmbeddingCandidate {
  employeeId: string;
  embedding: number[];
}

export function findBestMatch(
  probe: number[],
  candidates: StoredEmbeddingCandidate[]
): { employeeId: string; score: number } | null {
  let bestEmployeeId: string | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    const score = cosineSimilarity(probe, c.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestEmployeeId = c.employeeId;
    }
  }

  if (!bestEmployeeId) return null;
  return {
    employeeId: bestEmployeeId,
    score: Number(bestScore.toFixed(4)),
  };
}
