import Image from "next/image";
import type { Project } from "../../sanity.types";
import { urlFor } from "@/sanity/lib/image";

export function ContentImage({
  image,
  priority = false,
}: {
  image: NonNullable<Project["coverImage"]>;
  priority?: boolean;
}) {
  if (!image.asset) return null;

  return (
    <Image
      src={urlFor(image).width(1200).height(800).fit("crop").auto("format").url()}
      alt={image.alt ?? ""}
      width={1200}
      height={800}
      sizes="(max-width: 768px) 100vw, 896px"
      priority={priority}
      className="h-auto w-full rounded-lg"
    />
  );
}
