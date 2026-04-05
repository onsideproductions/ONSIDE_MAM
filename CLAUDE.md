# ONSIDE MAM - Media Asset Management

## Project Overview
Video-centric MAM system for Onside Productions. Helps the team upload, organize, and find video footage using AI-powered auto-tagging.

## Tech Stack
- **Backend**: Fastify v5 + TypeScript (apps/api)
- **Frontend**: SvelteKit 2 + Tailwind CSS v4 (apps/web)
- **Database**: PostgreSQL 16 via Drizzle ORM
- **Queue**: BullMQ + Redis 7
- **Storage**: Wasabi (S3-compatible) via @aws-sdk/client-s3
- **Upload**: tus protocol for resumable uploads
- **AI**: Google Gemini for video analysis and auto-tagging
- **Video**: FFmpeg for transcoding/thumbnails
- **Auth**: better-auth
- **Monorepo**: npm workspaces + Turborepo

## Development
```bash
# Start infrastructure
docker compose up -d

# Install dependencies
npm install

# Push DB schema
npm run db:push

# Start dev servers
npm run dev
```

## Project Structure
- `apps/api/` - Fastify backend (port 3001)
- `apps/web/` - SvelteKit frontend (port 3000)
- `packages/shared/` - Shared TypeScript types
- `deploy/` - NGINX and systemd configs for Ubuntu

## Key Patterns
- Workers run in separate process from API (`apps/api/src/workers/`)
- All video processing goes through BullMQ job queue
- Upload pipeline: tus upload -> metadata extraction -> transcoding -> thumbnails -> Gemini AI analysis -> ready
- Search spans asset title, description, AI-generated tags, and detected objects
- Wasabi accessed via @aws-sdk/client-s3 with endpoint override
