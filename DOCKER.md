# Run TrackWise with Docker

This setup runs the existing **Next.js 16 TrackWise app** on port **3015**.
It uses **Node.js 22** and **npm ci** with the repository's `package-lock.json`.
It does **not** run a PostgreSQL server: use your existing Neon (or another PostgreSQL) database.

## 1. Install Docker

Install Docker Desktop (or Docker Engine with the Compose plugin) on the machine that will run TrackWise. Open Docker Desktop before continuing.

## 2. Configure the environment

From the repository root, copy `.env.example` to `.env.local`.
On macOS/Linux:
```sh
cp .env.example .env.local
```
On Windows PowerShell:
```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` and set at least:
- `BETTER_AUTH_URL=http://localhost:3015` for local-only use; set your real HTTPS domain when deployed publicly.
- `BETTER_AUTH_SECRET` to a long, random value.
- `DATABASE_URL` to your Neon pooled PostgreSQL connection URL.
- `DATABASE_URL_DIRECT` to your Neon direct connection URL for schema changes, when available.

Check `ALLOWED_EMAIL_DOMAINS` in `.env.local`: the example allows only `intellibus.com` email addresses. Remove the variable if you intend to allow other email domains.

Configure SMTP if you need emails delivered; otherwise the project may log development email links to the server logs. **Do not put secrets into the Dockerfile, compose.yaml, or GitHub.** The `.dockerignore` excludes local `.env` files from the image.

## 3. Build the image

```sh
docker compose build
```

## 4. Apply the database schema (only if needed)

For a new database, or after a schema change:
```sh
docker compose run --rm trackwise npm run db:push
```

**Warning:** Check the target database and planned schema changes before running this command. Do not run `db:push` blindly against a live production database; use a backup and an approved migration procedure.

## 5. Start TrackWise

```sh
docker compose up -d
```

Open **http://localhost:3015**.

Useful commands:
```sh
docker compose logs -f trackwise  # Read app logs
docker compose ps                # Check container health
docker compose down              # Stop the container
docker compose up -d --build     # Rebuild after code changes
```

## Important notes

- `compose.yaml` sends `.env.local` into the container **at runtime**; your passwords are not packaged into the image.
- Production servers must use a proper **HTTPS domain** in `BETTER_AUTH_URL` and a valid secret.
- Do not configure `TEST_MODE_SECRET` on a production server.
- If `npm run build` needs runtime-only database or auth variables, review the Next.js code's build-time initialization instead of embedding live credentials in the image.
- Docker image builds need network access to npm and potentially Google Fonts during the Next.js build.
- This initial Docker image includes development dependencies for the documented one-off Drizzle command. It can be optimized once the container build has been verified.
