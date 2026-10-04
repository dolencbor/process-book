# Process Book web

Next.js App Router frontend connected to Sanity project `6ny2t94o`, dataset `production`.
The standalone Studio lives in `../studio`; it is not embedded in this app.

## Local development

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. In a second terminal, run `npm run dev` in `../studio`
and open http://localhost:3333. Local CORS origins are configured in Sanity.

## Content

Create and publish a **Project** in the Studio, including a generated slug. Create
**Process Entries**, choose their Project reference, add an entry date, and publish.
The homepage lists published projects. `/projects/[slug]` shows their entries in
chronological order, with Portable Text notes and images.

The homepage shows an empty state until a project is published. Missing project
slugs return 404. Drafts are not shown on the public website.

## Sanity integration

- `src/sanity/lib/client.ts`: published-content client with a pinned API date.
- `src/sanity/lib/live.ts`: Live Content API fetching and invalidation.
- `src/sanity/lib/queries.ts`: named GROQ queries, typed by Sanity TypeGen.
- `src/sanity/lib/image.ts`: image URLs respecting Studio crop and hotspot settings.
- `sanity.types.ts`: generated schema/query types; do not edit manually.

This dataset is public; published-content reads and live updates require no API
token. Visual Editing and draft preview are not configured in this initial setup.

After changing Studio schemas or GROQ queries, regenerate types from the Studio:

```sh
cd ../studio
npm run typegen
```

TypeGen also runs automatically during Studio development/builds. Commit the
generated `sanity.types.ts` alongside schema/query changes.

## Deployment and checks

Set `NEXT_PUBLIC_SANITY_PROJECT_ID=6ny2t94o` and
`NEXT_PUBLIC_SANITY_DATASET=production` in your deployment environment. Add the
actual frontend origin to Sanity CORS origins before enabling browser live updates.
Deploy the Studio separately with its own CLI.

```sh
npm run lint
npx tsc --noEmit
npm run build
```

Dependency audit at setup reported advisories in Sanity CLI/tooling dependencies
pulled in by next-sanity's peer dependencies. npm's suggested remediation was a
major next-sanity downgrade; it was not applied. Recheck with `npm audit` when
updating dependencies.
