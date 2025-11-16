import * as fs from 'fs';
import * as path from 'path';

interface Embedding {
  text: string;
  vector: number[];
}

interface Document {
  id: string;
  content: string;
  embedding?: number[];
}

export class AdapterService {
  private documents: Map<string, Document> = new Map();
  private embeddingsPath: string;

  constructor() {
    // Store embeddings in a local file
    const appDataPath = process.env.APPDATA || 
      (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
    const devSkinPath = path.join(appDataPath, 'dev-skin');
    
    if (!fs.existsSync(devSkinPath)) {
      fs.mkdirSync(devSkinPath, { recursive: true });
    }
    
    this.embeddingsPath = path.join(devSkinPath, 'embeddings.json');
    this.loadEmbeddings();
  }

  // Simple embedding function (in production, use a proper embedding model)
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple hash-based embedding for demo purposes
    // In production, use a proper embedding model like sentence-transformers
    const hash = this.simpleHash(text);
    const embedding = new Array(128).fill(0).map((_, i) => {
      return Math.sin(hash + i) * 0.5 + 0.5;
    });
    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  // Cosine similarity
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async embed(text: string): Promise<number[]> {
    return this.generateEmbedding(text);
  }

  async query(query: string, context?: string): Promise<string> {
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Find similar documents
    const similarities: Array<{ doc: Document; score: number }> = [];
    
    for (const doc of this.documents.values()) {
      if (doc.embedding) {
        const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
        similarities.push({ doc, score });
      }
    }
    
    // Sort by similarity
    similarities.sort((a, b) => b.score - a.score);
    
    // Get top 3 most similar documents
    const topDocs = similarities.slice(0, 3).map(s => s.doc.content);
    
    // Simple LLM simulation (in production, use actual LLM API)
    const contextText = context ? `\nContext: ${context}` : '';
    const retrievedDocs = topDocs.length > 0 ? `\nRelevant information:\n${topDocs.join('\n\n')}` : '';
    
    return `Based on the query "${query}"${contextText}${retrievedDocs}\n\nResponse: This is a simulated LLM response. In production, this would call an actual LLM API with the retrieved context.`;
  }

  async addDocument(id: string, content: string): Promise<void> {
    const embedding = await this.generateEmbedding(content);
    this.documents.set(id, { id, content, embedding });
    this.saveEmbeddings();
  }

  private loadEmbeddings(): void {
    try {
      if (fs.existsSync(this.embeddingsPath)) {
        const data = fs.readFileSync(this.embeddingsPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.documents = new Map(parsed);
      }
    } catch (error) {
      console.error('Error loading embeddings:', error);
    }
  }

  private saveEmbeddings(): void {
    try {
      const data = Array.from(this.documents.entries());
      fs.writeFileSync(this.embeddingsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving embeddings:', error);
    }
  }
}

