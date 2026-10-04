import "server-only";
import { defineLive } from "next-sanity/live";
import { client } from "./client";

// Published content in this public dataset needs no read token.
export const { sanityFetch, SanityLive } = defineLive({
  client,
  serverToken: false,
  browserToken: false,
});
