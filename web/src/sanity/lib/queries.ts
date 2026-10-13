import { defineQuery } from "next-sanity";

export const WEEK_POST_QUERY = defineQuery(`
  *[_type == "post" && _id == $id][0] {
    _id, title, weekNumber, entryDate, coverImage, body,
    "category": category->{title, key}
  }
`);

export const PROCESS_BOOK_QUERY = defineQuery(`
  {
    "categories": *[_type == "category" && defined(key)]{_id, title, key},
    "posts": *[_type == "post" && defined(weekNumber) && defined(category._ref)]
      | order(weekNumber asc, _id asc) {
        _id, title, weekNumber, "categoryId": category._ref,
        "coverImage": coalesce(coverImage, body[_type == "image" && defined(asset)][0]) {
          asset, crop, hotspot, alt
        }
      }
  }
`);

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
