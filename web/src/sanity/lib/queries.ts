import { defineQuery } from "next-sanity";

export const PROJECTS_QUERY = defineQuery(`
  *[_type == "project" && defined(slug.current)]
  | order(startedAt desc, _createdAt desc) {
    _id, title, "slug": slug.current, summary, coverImage,
    "entryCount": count(*[_type == "processEntry" && project._ref == ^._id])
  }
`);

export const PROJECT_QUERY = defineQuery(`
  *[_type == "project" && slug.current == $slug][0] {
    _id, title, summary, coverImage, startedAt,
    "entries": *[_type == "processEntry" && project._ref == ^._id]
      | order(entryDate asc, _createdAt asc) {
        _id, title, entryDate, body
      }
  }
`);
