export interface Collection {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  coverAssetId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CollectionWithCounts extends Collection {
  assetCount: number;
  children: CollectionWithCounts[];
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  parentId?: string;
}

export interface UpdateCollectionInput {
  name?: string;
  description?: string;
  parentId?: string;
  coverAssetId?: string;
}
