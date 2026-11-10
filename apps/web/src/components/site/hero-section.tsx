import { ReactNode } from "react";

interface HeroSectionProps {
  heading: ReactNode;
  description: ReactNode;
  actions: ReactNode;
  media: ReactNode; // shown beside the text on wide screens, below it on narrow
}

// The opening section of a landing page.
export function HeroSection({
  heading,
  description,
  actions,
  media,
}: HeroSectionProps) {
  return (
    <section className="px-[5%] py-16 md:py-24 lg:py-28">
      <div className="container grid items-center gap-12 md:gap-16 lg:grid-cols-2 lg:gap-x-20">
        <div>
          <h1 className="mb-5 text-6xl font-bold md:mb-6 md:text-9xl lg:text-10xl">
            {heading}
          </h1>
          <p className="md:text-md">{description}</p>
          <div className="mt-6 flex flex-wrap gap-4 md:mt-8">{actions}</div>
        </div>
        <div className="overflow-hidden md:max-h-[750px] lg:h-[750px]">
          {media}
        </div>
      </div>
    </section>
  );
}
