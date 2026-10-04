import { PortableText, type PortableTextComponents } from "next-sanity";
import type { ProcessEntry } from "../../sanity.types";
import { ContentImage } from "./content-image";

type Body = NonNullable<ProcessEntry["body"]>;
type EntryImage = Extract<Body[number], { _type: "image" }>;

const components: PortableTextComponents = {
  types: {
    image: ({ value }: { value: EntryImage }) => (
      <figure className="my-8">
        <ContentImage image={value} />
        {value.caption ? <figcaption className="mt-2 text-sm opacity-70">{value.caption}</figcaption> : null}
      </figure>
    ),
  },
  marks: {
    link: ({ children, value }) => {
      const href: unknown = value?.href;
      if (typeof href !== "string" || !/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(href)) {
        return <>{children}</>;
      }
      return <a className="underline underline-offset-4" href={href}>{children}</a>;
    },
  },
};

export function ProcessBody({ value }: { value: Body }) {
  return (
    <div className="space-y-4 leading-7 [&_h2]:text-2xl [&_h3]:text-xl [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4">
      <PortableText value={value} components={components} />
    </div>
  );
}
