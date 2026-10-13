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

The homepage's Scroll cards and List rows/previews read the same published **Week
Posts** (`post`) from Sanity. Each post has a continuous week number, title,
**Period Category** reference (`category`), entry date, card image with alt text,
and rich-text notes. Category membership determines the active tab and its first
week; published post counts determine ranges and loop length. There is no fixed
seven-week assumption in the app's navigation.

Edit the four period categories and 28 published mock posts at
https://processbook.sanity.studio/. Replace the mock titles, notes, images and
crop/hotspot settings, then publish. Sanity Live updates published content in the
website without an application rebuild. Drafts stay private. An empty dataset
shows an empty state; a category without posts is disabled. Text/image edits keep
the current position; changing membership/order safely resets the scrolling loops.

The older `/projects/[slug]` pages and their original schemas remain available
for existing project content; they do not supply the homepage's weekly posts.

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

The app defaults to project `6ny2t94o` and dataset `production`, matching the
standalone Studio. `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET`
can override these public defaults at build time; redeploy after changing them.
`.env.example` documents the optional overrides, but is not loaded by Next.js.
Add the actual frontend origin to Sanity CORS origins before enabling browser
live updates.
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
