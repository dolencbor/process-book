import Link from "next/link";
import { ContentImage } from "@/components/content-image";
import { sanityFetch } from "@/sanity/lib/live";
import { PROJECTS_QUERY } from "@/sanity/lib/queries";

export default async function Home() {
  const { data: projects } = await sanityFetch({ query: PROJECTS_QUERY, perspective: "published", stega: false });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">Process Book</h1>
        <p className="mt-4 text-lg opacity-70">Design projects and the process behind them.</p>
      </header>
      {projects.length ? (
        <ul className="grid gap-10 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project._id}>
              <Link href={`/projects/${encodeURIComponent(project.slug ?? "")}`} className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
                {project.coverImage ? <ContentImage image={project.coverImage} /> : null}
                <h2 className="mt-4 text-2xl font-medium group-hover:underline">{project.title ?? "Untitled project"}</h2>
                {project.summary ? <p className="mt-2 opacity-70">{project.summary}</p> : null}
                <p className="mt-3 text-sm opacity-60">{project.entryCount} process {project.entryCount === 1 ? "entry" : "entries"}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-lg border border-current/15 p-8 opacity-70">No projects published yet. Check back soon.</p>}
    </main>
  );
}
