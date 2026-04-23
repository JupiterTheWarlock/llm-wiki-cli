import type { EmbeddingConfig } from './config.js';

function resolveApiKey(key: string): string {
  if (key.startsWith('$')) {
    const envVar = key.slice(1);
    const value = process.env[envVar];
    if (!value) {
      throw new Error(`Embedding API key references env var $${envVar} but it is not set`);
    }
    return value;
  }
  return key;
}

export async function generateEmbedding(text: string, config: EmbeddingConfig): Promise<number[]> {
  const apiKey = resolveApiKey(config.api_key);
  const url = `${config.api_url.replace(/\/$/, '')}/embeddings`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
      dimensions: config.dimensions,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };

  if (!data.data?.[0]?.embedding) {
    throw new Error('Embedding API returned no embedding data');
  }

  return data.data[0].embedding;
}
