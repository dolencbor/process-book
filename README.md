# Process Book

Design projects and their process entries, powered by Sanity and Next.js.

## Structure

- `studio/`: standalone Sanity Studio for project `6ny2t94o`, dataset `production`.
- `web/`: Next.js frontend with project pages, Portable Text, images, and live content updates.

The Studio is a separate app and is not embedded in Next.js.

## Local development

Install dependencies in each app, then run them in separate terminals:

```sh
cd studio
npm ci
npm run dev
```

```sh
cd web
npm ci
cp .env.example .env.local
npm run dev
```

Open the website at http://localhost:3000 and the Studio at http://localhost:3333.
Sign in to the Studio, publish a Project with a slug, then publish Process Entries
referencing that Project. The website only displays published content.

After schema or GROQ query changes, regenerate frontend types from `studio/`:

```sh
npm run typegen
```

See [Studio setup](studio/README.md) and [web setup](web/README.md) for schema
deployment, validation, environment configuration, and deployment details.

## Vercel Services

Import the repository as one Vercel project with its Root Directory set to the
repository root, where `vercel.json` defines two independently built services.
Each service uses `npm ci` and its own `npm run build` script.

The deployment routes are:

| Service | Directory | Public access | Calls to other services |
| --- | --- | --- | --- |
| `web` | `web/` | All paths (`/(.*)`) | None |
| `studio` | `studio/` | Internal only; no public rewrite | None |

Both applications connect directly to Sanity's hosted Content Lake. The Studio
is an editing application, not the website's content API, so no Vercel service
bindings are needed. The Next.js app stays at `/` and needs no base path change.
The Studio remains standalone. As currently configured, its Vercel service
cannot be opened from a browser; use the local Studio or a separately hosted
Studio for editing. Publishing it under a path such as `/studio` requires a
specific top-level rewrite and matching Sanity base path and asset URLs.

The website defaults to Sanity project `6ny2t94o` and dataset `production`, so
deployments build without additional environment configuration. To override
these defaults, set shared Vercel environment variables for Preview and Production:

```dotenv
NEXT_PUBLIC_SANITY_PROJECT_ID=6ny2t94o
NEXT_PUBLIC_SANITY_DATASET=production
```

Overrides must be available during the Next.js build; redeploy after changing
them. No read token is needed for published content in this public dataset. Add
the actual deployment origin to Sanity CORS origins for browser live updates; if the Studio
is made public, its origin also needs credential-enabled CORS for editor login.

To test both services together from the repository root:

```sh
cp .env.example .env.local
npx --yes vercel@latest dev -L
```

`-L` runs locally without creating or linking a cloud project. Service bindings,
if added for future backend services, are injected by Vercel in runtime functions;
do not set their variables manually or use them during builds or in middleware.

See [Vercel Services](https://vercel.com/docs/services) for the current format.
