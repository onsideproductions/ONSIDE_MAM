export type AssetStatus = 'uploading' | 'processing' | 'analyzing' | 'ready' | 'error';

export interface Asset {
  id: string;
  title: string;
  description: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  framerate: number | null;
  codec: string | null;
  status: AssetStatus;
  storageKey: string;
  proxyKey: string | null;
  hlsKey: string | null;
  thumbnailKey: string | null;
  spriteKey: string | null;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetWithTags extends Asset {
  tags: Tag[];
  aiAnalysis: AiAnalysis | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface AiAnalysis {
  id: string;
  assetId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  sceneDescriptions: SceneDescription[] | null;
  detectedTags: string[];
  detectedObjects: string[];
  detectedText: string[];
  summary: string | null;
  modelUsed: string | null;
  analyzedAt: string | null;
}

export interface SceneDescription {
  timecode: number;
  description: string;
}

export interface CreateAssetInput {
  title: string;
  description?: string;
  collectionId?: string;
}

export interface UpdateAssetInput {
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AssetSearchParams {
  query?: string;
  tags?: string[];
  status?: AssetStatus;
  collectionId?: string;
  mimeType?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'title' | 'fileSize' | 'duration';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
