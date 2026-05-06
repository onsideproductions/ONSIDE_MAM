import type { FastifyPluginAsync } from 'fastify';
import { sql, eq, and, inArray, gte, lte, desc, asc } from 'drizzle-orm';
import {
  getDb,
  assets,
  tags,
  assetTags,
  aiAnalysis,
  collectionAssets,
  transcripts,
} from '../db/index.js';
import { getStreamUrl } from '../lib/storage.js';

type SortKey = 'relevance' | 'newest' | 'oldest' | 'longest' | 'shortest' | 'name';

interface SearchQuery {
  q?: string;
  tags?: string;
  status?: string; // comma-separated
  collection?: string; // collectionId - recursive descendants
  minDuration?: number;
  maxDuration?: number;
  minWidth?: number;
  minHeight?: number;
  uploadedAfter?: string; // ISO date
  uploadedBefore?: string;
  sort?: SortKey;
  page?: number;
  limit?: number;
}

export const searchRoutes: FastifyPluginAsync = async (app) => {
  // Full-text search with rich filtering
  app.get('/', async (request) => {
    const params = request.query as SearchQuery;
    const {
      q = '',
      tags: tagFilter,
      status,
      collection,
      minDuration,
      maxDuration,
      minWidth,
      minHeight,
      uploadedAfter,
      uploadedBefore,
      sort = 'relevance',
      page = 1,
      limit = 24,
    } = params;

    const db = getDb();
    const offset = (Number(page) - 1) * Number(limit);
    const tagList = tagFilter ? tagFilter.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const statusList = status ? status.split(',').map((s) => s.trim()).filter(Boolean) : [];

    // Resolve collection descendants up front (single recursive CTE)
    let collectionAssetIds: string[] | null = null;
    if (collection) {
      const r = await db.execute(sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM collections WHERE id = ${collection}
          UNION ALL
          SELECT c.id FROM collections c
          INNER JOIN descendants d ON c.parent_id = d.id
        )
        SELECT DISTINCT ca.asset_id
        FROM collection_assets ca
        WHERE ca.collection_id IN (SELECT id FROM descendants)
      `);
      const raw = r as unknown as { rows?: Array<{ asset_id: string }> } | Array<{ asset_id: string }>;
      const rows: Array<{ asset_id: string }> = Array.isArray(raw) ? raw : raw.rows ?? [];
      collectionAssetIds = rows.map((row) => row.asset_id);
      // No matching assets - early return
      if (collectionAssetIds.length === 0) {
        return {
          data: [],
          total: 0,
          page: Number(page),
          limit: Number(limit),
          totalPages: 0,
        };
      }
    }

    const conditions: ReturnType<typeof sql>[] = [];

    if (q) {
      const like = `%${q}%`;
      conditions.push(
        sql`(
          ${assets.title} ILIKE ${like}
          OR ${assets.description} ILIKE ${like}
          OR ${assets.originalFilename} ILIKE ${like}
          OR ${aiAnalysis.summary} ILIKE ${like}
          OR ${q} ILIKE ANY(${aiAnalysis.detectedTags})
          OR ${q} ILIKE ANY(${aiAnalysis.detectedObjects})
          OR ${transcripts.fullText} ILIKE ${like}
        )`
      );
    }

    if (statusList.length) {
      conditions.push(sql`${inArray(assets.status, statusList)}`);
    }

    if (collectionAssetIds) {
      conditions.push(sql`${inArray(assets.id, collectionAssetIds)}`);
    }

    if (minDuration !== undefined) conditions.push(sql`${gte(assets.duration, Number(minDuration))}`);
    if (maxDuration !== undefined) conditions.push(sql`${lte(assets.duration, Number(maxDuration))}`);
    if (minWidth !== undefined) conditions.push(sql`${gte(assets.width, Number(minWidth))}`);
    if (minHeight !== undefined) conditions.push(sql`${gte(assets.height, Number(minHeight))}`);
    if (uploadedAfter) conditions.push(sql`${gte(assets.createdAt, new Date(uploadedAfter))}`);
    if (uploadedBefore) conditions.push(sql`${lte(assets.createdAt, new Date(uploadedBefore))}`);

    // Build ORDER BY based on sort
    const relevanceExpr = q
      ? sql<number>`ts_rank(
          to_tsvector('english',
            coalesce(${assets.title}, '') || ' ' ||
            coalesce(${assets.description}, '') || ' ' ||
            coalesce(${assets.originalFilename}, '') || ' ' ||
            coalesce(${aiAnalysis.summary}, '')
          ),
          plainto_tsquery('english', ${q})
        )`
      : sql<number>`0`;

    let orderBy;
    switch (sort) {
      case 'newest':
        orderBy = desc(assets.createdAt);
        break;
      case 'oldest':
        orderBy = asc(assets.createdAt);
        break;
      case 'longest':
        orderBy = sql`${assets.duration} DESC NULLS LAST`;
        break;
      case 'shortest':
        orderBy = sql`${assets.duration} ASC NULLS LAST`;
        break;
      case 'name':
        orderBy = asc(assets.title);
        break;
      case 'relevance':
      default:
        // When no query, fall back to newest
        orderBy = q ? sql`${relevanceExpr} DESC, ${assets.createdAt} DESC` : desc(assets.createdAt);
    }

    let query = db
      .selectDistinctOn([assets.id], {
        asset: assets,
        aiSummary: aiAnalysis.summary,
      })
      .from(assets)
      .leftJoin(aiAnalysis, eq(aiAnalysis.assetId, assets.id))
      .leftJoin(transcripts, eq(transcripts.assetId, assets.id))
      .leftJoin(assetTags, eq(assetTags.assetId, assets.id))
      .leftJoin(tags, eq(tags.id, assetTags.tagId));

    if (tagList.length) {
      conditions.push(inArray(tags.name, tagList));
    }

    if (conditions.length) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // SELECT DISTINCT ON requires the ORDER BY to lead with the distinct column
    // so we wrap in a subquery for proper ordering
    const innerRows = await query;

    // Total count
    let countQuery = db
      .select({ count: sql<number>`count(DISTINCT ${assets.id})` })
      .from(assets)
      .leftJoin(aiAnalysis, eq(aiAnalysis.assetId, assets.id))
      .leftJoin(transcripts, eq(transcripts.assetId, assets.id))
      .leftJoin(assetTags, eq(assetTags.assetId, assets.id))
      .leftJoin(tags, eq(tags.id, assetTags.tagId));
    if (conditions.length) {
      countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
    }
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);

    // Apply ordering and pagination in JS for simplicity (DISTINCT ON ordering rules)
    const ordered = [...innerRows];
    ordered.sort((a, b) => {
      switch (sort) {
        case 'newest':
          return new Date(b.asset.createdAt).getTime() - new Date(a.asset.createdAt).getTime();
        case 'oldest':
          return new Date(a.asset.createdAt).getTime() - new Date(b.asset.createdAt).getTime();
        case 'longest':
          return (b.asset.duration ?? 0) - (a.asset.duration ?? 0);
        case 'shortest':
          return (a.asset.duration ?? 0) - (b.asset.duration ?? 0);
        case 'name':
          return a.asset.title.localeCompare(b.asset.title);
        case 'relevance':
        default:
          // Fallback to newest when no query
          return new Date(b.asset.createdAt).getTime() - new Date(a.asset.createdAt).getTime();
      }
    });

    const paged = ordered.slice(offset, offset + Number(limit));

    // Add signed thumbnail URLs
    const data = await Promise.all(
      paged.map(async (r) => {
        let thumbnailUrl: string | null = null;
        if (r.asset.thumbnailKey) {
          thumbnailUrl = await getStreamUrl(r.asset.thumbnailKey);
        }
        return {
          ...r.asset,
          aiSummary: r.aiSummary,
          thumbnailUrl,
        };
      })
    );

    return {
      data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    };
  });

  // Get all tags (for filter UI)
  app.get('/tags', async () => {
    const db = getDb();

    const result = await db
      .select({
        tag: tags,
        count: sql<number>`count(${assetTags.assetId})`,
      })
      .from(tags)
      .leftJoin(assetTags, eq(assetTags.tagId, tags.id))
      .groupBy(tags.id)
      .orderBy(sql`count(${assetTags.assetId}) DESC`);

    return result.map((r) => ({
      ...r.tag,
      assetCount: Number(r.count),
    }));
  });

  // Search facets - aggregate counts for status, duration buckets, etc.
  app.get('/facets', async () => {
    const db = getDb();
    const statusCounts = await db
      .select({
        status: assets.status,
        count: sql<number>`count(*)`,
      })
      .from(assets)
      .groupBy(assets.status);

    return {
      status: statusCounts.map((s) => ({ value: s.status, count: Number(s.count) })),
    };
  });
};
