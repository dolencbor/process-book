// Public defaults match the standalone Process Book Studio.
export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "6ny2t94o";
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";

// Pin API behavior; update deliberately when adopting new Sanity features.
export const apiVersion = "2026-10-04";
