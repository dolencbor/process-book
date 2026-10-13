import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProcessBody } from "@/components/process-body";
import { WeekCover } from "@/components/week-cover";
import styles from "@/components/week-page.module.css";
import { sanityFetch } from "@/sanity/lib/live";
import { WEEK_POST_QUERY } from "@/sanity/lib/queries";
import { urlFor } from "@/sanity/lib/image";

type Props = { params: Promise<{ id: string }> };

const getWeek = cache(async (id: string) => {
  const { data } = await sanityFetch({ query: WEEK_POST_QUERY, params: { id }, perspective: "published", stega: false });
  if (!data) notFound();
  return data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getWeek((await params).id);
  return { title: `Week ${String(post.weekNumber ?? "").padStart(2, "0")} — ${post.title || "Untitled week"}` };
}

export default async function WeekPage({ params }: Props) {
  const post = await getWeek((await params).id);
  const number = String(post.weekNumber ?? "").padStart(2, "0");
  return <main className={styles.page}>
    <article>
      <header className={styles.heading}>
        <div className={styles.meta}><p>Week {number}</p>{post.category?.title ? <p className={styles.category}>{post.category.title}</p> : null}</div>
        <h1>{post.title || "Untitled week"}</h1>
        {post.entryDate ? <time className={styles.date} dateTime={post.entryDate}>{new Date(`${post.entryDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time> : null}
      </header>
      {post.coverImage?.asset ? <WeekCover><Image unoptimized priority
        src={urlFor(post.coverImage).width(1200).height(1200).fit("crop").auto("format").quality(85).url()}
        width={1200} height={1200} alt={post.coverImage.alt || `Visual study for week ${number}`} />
      </WeekCover> : null}
      {post.body?.length ? <section className={styles.body} aria-label={`Week ${number} notes`}><ProcessBody value={post.body} /></section> : null}
    </article>
  </main>;
}
