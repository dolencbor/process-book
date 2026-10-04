import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentImage } from "@/components/content-image";
import { ProcessBody } from "@/components/process-body";
import { sanityFetch } from "@/sanity/lib/live";
import { PROJECT_QUERY } from "@/sanity/lib/queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: project } = await sanityFetch({ query: PROJECT_QUERY, params: await params, perspective: "published", stega: false });
  return { title: project?.title ?? "Project not found", description: project?.summary ?? undefined };
}

export default async function ProjectPage({ params }: Props) {
  const { data: project } = await sanityFetch({ query: PROJECT_QUERY, params: await params, perspective: "published", stega: false });
  if (!project) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Link href="/" className="text-sm underline underline-offset-4">← All projects</Link>
      <header className="my-10">
        <h1 className="text-4xl font-semibold tracking-tight">{project.title ?? "Untitled project"}</h1>
        {project.summary ? <p className="mt-4 text-lg opacity-70">{project.summary}</p> : null}
        {project.coverImage ? <div className="mt-8"><ContentImage image={project.coverImage} priority /></div> : null}
      </header>
      <section aria-labelledby="process-heading">
        <h2 id="process-heading" className="mb-8 text-2xl font-semibold">Process</h2>
        {project.entries.length ? project.entries.map((entry) => (
          <article key={entry._id} className="border-t border-current/15 py-8">
            {entry.entryDate ? <time dateTime={entry.entryDate} className="text-sm opacity-60">{new Date(`${entry.entryDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time> : null}
            <h3 className="mb-5 mt-2 text-xl font-medium">{entry.title ?? "Untitled entry"}</h3>
            {entry.body ? <ProcessBody value={entry.body} /> : null}
          </article>
        )) : <p className="opacity-70">No process entries published yet.</p>}
      </section>
    </main>
  );
}
