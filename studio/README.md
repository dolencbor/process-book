# Process Book Studio

Standalone Sanity Studio for project `6ny2t94o`, dataset `production`.

```sh
npm install
npm run dev
```

Open http://localhost:3333. Run the Next.js app separately from `../web`.

## Content model

- **Period Category** (`category`): title and the school-period key linking it to
  Foundation, Playgrounds S1, Personal Project, or Playgrounds S2.
- **Week Post** (`post`): title, continuous week number, one category reference,
  entry date, card image with alt text/crop/hotspot, and rich-text notes/images.

The sidebar lists Week Posts by week number and shows the week number in each
preview, so mock posts with identical titles remain easy to identify. The four
periods are categories; each week is a separate post. The dataset contains four
published categories and 28 published mock posts based on the current frontend.
Their dates and notes are placeholders.

Edit at https://processbook.sanity.studio/. Publish a post to update both Scroll
and List; drafts are not shown publicly. The original Project and Process Entry
schemas remain for compatibility with the older project pages, but are not used
by the homepage or displayed in the new editing sidebar.

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
