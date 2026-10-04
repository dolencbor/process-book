# Process Book Studio

Standalone Sanity Studio for project `6ny2t94o`, dataset `production`.

```sh
npm install
npm run dev
```

Open http://localhost:3333. Run the Next.js app separately from `../web`.

## Content model

- **Project**: title, slug, summary, cover image with alternative text, and start date.
- **Process Entry**: title, Project reference, entry date, and Portable Text notes
  with images and captions.

Publish a Project with a slug, then publish Process Entries referencing that
Project. Entries appear in chronological order on the project's website page.
Draft content stays inside the Studio.

## Schema and types

Local files in `schemaTypes/` are the source of truth. After schema changes:

```sh
npx sanity schemas deploy
npm run typegen
```

TypeGen scans `../web/src` and writes `../web/sanity.types.ts`. Re-run it after
changing frontend GROQ queries. It is also enabled during Studio development/builds.

```sh
npx tsc --noEmit
npx eslint schemaTypes sanity.config.ts sanity.cli.ts
npm run build
```

Deploy independently with `npm run deploy` when a hosted Studio is needed.
Auto-updates remain enabled in `sanity.cli.ts`.
