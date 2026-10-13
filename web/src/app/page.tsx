import { ProcessBook } from "@/components/process-book";
import { sanityFetch } from "@/sanity/lib/live";
import { PROCESS_BOOK_QUERY } from "@/sanity/lib/queries";
import { createProcessBookContent } from "@/sanity/lib/process-book";

export default async function Home() {
  const { data } = await sanityFetch({ query: PROCESS_BOOK_QUERY, perspective: "published", stega: false });
  return <ProcessBook content={createProcessBookContent(data)} />;
}
