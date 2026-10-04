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
