# Code Aggregator

A Bun + Turborepo monorepo with a React frontend that talks to a WebSocket backend. The backend stores workspaces and sessions in MongoDB and uses the Claude Agent SDK to answer messages.

## Project structure

```text
apps/
  backend/    WebSocket server (ws, port 3000), MongoDB via mongoose, Claude Agent SDK
  frontend/   React 19 + Tailwind app served by Bun (port 1573)
packages/
  common/     Shared message types and schemas
  db/         Mongoose models (workspaces, sessions)
  ui/, eslint-config/, typescript-config/   Shared tooling
```

## Prerequisites

- [Bun](https://bun.sh) 1.4+
- Node.js 24+
- [Docker](https://www.docker.com/) (to run MongoDB locally)
- Claude credentials for the Agent SDK: either set `ANTHROPIC_API_KEY`, or be logged in to Claude Code on this machine

## Quick start

### 1. Install dependencies

```sh
bun install
```

### 2. Start MongoDB in Docker

```sh
docker run -d --name codeagg-mongo -p 27017:27017 -v codeagg-mongo-data:/data/db mongo
```

The `codeagg-mongo-data` volume keeps your data if the container is removed.

### 3. Configure the backend

```sh
cp apps/backend/.env.example apps/backend/.env
```

Set the MongoDB connection string in `apps/backend/.env`:

```sh
DB_URI=mongodb://127.0.0.1:27017/codeAgg
```

If `DB_URI` is not set, the backend uses `mongodb://127.0.0.1:27017/codeAgg` by default.

### 4. Run the backend

```sh
cd apps/backend
bun index.ts
```

The WebSocket server listens on `ws://localhost:3000`.

### 5. Run the frontend

In a second terminal:

```sh
cd apps/frontend
bun dev
```

Open <http://localhost:1573>.

## Stopping and cleaning up

Stop the backend and frontend with `Ctrl+C` in their terminals.

Stop and remove MongoDB:

```sh
docker stop codeagg-mongo
docker rm codeagg-mongo
```

To free disk space, also remove the image and, if you no longer need the data, the volume:

```sh
docker rmi mongo
docker volume rm codeagg-mongo-data   # deletes all stored data
```

## Other scripts

Run from the repo root:

| Command               | Description                          |
| --------------------- | ------------------------------------ |
| `bun run build`       | Build all apps and packages          |
| `bun run lint`        | Lint all apps and packages           |
| `bun run check-types` | Type-check all apps and packages     |
| `bun run format`      | Format `.ts`, `.tsx` and `.md` files |
