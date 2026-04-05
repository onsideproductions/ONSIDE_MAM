import type { FastifyPluginAsync } from 'fastify';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { getDb, assets, tags, assetTags, aiAnalysis } from '../db/index.js';

export const searchRoutes: FastifyPluginAsync = async (app) => {
  // Full-text search across assets, tags, and AI analysis
  app.get('/', async (request) => {
    const {
      q = '',
      tags: tagFilter,
      page = 1,
      limit = 24,
    } = request.query as {
      q?: string;
      tags?: string;
      page?: number;
      limit?: number;
    };

    const db = getDb();
    const offset = (page - 1) * limit;
    const tagList = tagFilter ? tagFilter.split(',').map((t) => t.trim()) : [];

    // Build search query
    // Search across title, description, AI summary, AI detected tags
    let query = db
      .selectDistinctOn([assets.id], {
        asset: assets,
        aiSummary: aiAnalysis.summary,
        relevance: q
          ? sql<number>`
              ts_rank(
                to_tsvector('english', coalesce(${assets.title}, '') || ' ' || coalesce(${assets.description}, '') || ' ' || coalesce(${aiAnalysis.summary}, '')),
                plainto_tsquery('english', ${q})
              )`
          : sql<number>`1`,
      })
      .from(assets)
      .leftJoin(aiAnalysis, eq(aiAnalysis.assetId, assets.id))
      .leftJoin(assetTags, eq(assetTags.assetId, assets.id))
      .leftJoin(tags, eq(tags.id, assetTags.tagId));

    const conditions = [];

    // Text search condition
    if (q) {
      conditions.push(
        sql`(
          ${assets.title} ILIKE ${`%${q}%`}
          OR ${assets.description} ILIKE ${`%${q}%`}
          OR ${aiAnalysis.summary} ILIKE ${`%${q}%`}
          OR ${q} = ANY(${aiAnalysis.detectedTags})
          OR ${q} = ANY(${aiAnalysis.detectedObjects})
        )`
      );
    }

    // Tag filter
    if (tagList.length > 0) {
      conditions.push(inArray(tags.name, tagList));
    }

    // Only show ready assets
    conditions.push(eq(assets.status, 'ready'));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await (query as any).limit(limit).offset(offset);

    // Get total count
    const countConditions = [...conditions];
    const countQuery = db
      .select({ count: sql<number>`count(DISTINCT ${assets.id})` })
      .from(assets)
      .leftJoin(aiAnalysis, eq(aiAnalysis.assetId, assets.id))
      .leftJoin(assetTags, eq(assetTags.assetId, assets.id))
      .leftJoin(tags, eq(tags.id, assetTags.tagId));

    const countResult =
      countConditions.length > 0
        ? await (countQuery.where(and(...countConditions)) as any)
        : await countQuery;

    const total = Number(countResult[0]?.count || 0);

    return {
      data: results.map((r: any) => ({
        ...r.asset,
        aiSummary: r.aiSummary,
      })),
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
};
