import { ReactNode } from "react";

interface Feature {
  icon: ReactNode;
  heading: string;
  description: string;
}

interface FeatureSectionProps {
  eyebrow: string; // a short line above the heading
  heading: string;
  description: string;
  features: Feature[];
  actions: ReactNode;
}

// A heading and its description side by side, then the features in columns.
export function FeatureSection({
  eyebrow,
  heading,
  description,
  features,
  actions,
}: FeatureSectionProps) {
  return (
    <section className="px-[5%] py-16 md:py-24 lg:py-28">
      <div className="container">
        <div className="mb-12 grid items-start gap-5 md:mb-18 md:grid-cols-2 md:gap-x-12 lg:mb-20 lg:gap-x-20">
          <div>
            <p className="mb-3 font-semibold md:mb-4">{eyebrow}</p>
            <h2 className="text-5xl font-bold md:text-7xl lg:text-8xl">
              {heading}
            </h2>
          </div>
          <p className="md:text-md">{description}</p>
        </div>
        <ul className="grid items-start gap-y-12 md:grid-cols-3 md:gap-x-8 md:gap-y-16 lg:gap-x-12">
          {features.map((feature) => (
            <li key={feature.heading}>
              <div className="mb-5 md:mb-6">{feature.icon}</div>
              <h3 className="mb-5 text-2xl font-bold md:mb-6 md:text-3xl lg:text-4xl">
                {feature.heading}
              </h3>
              <p>{feature.description}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-4 md:mt-14 lg:mt-16">
          {actions}
        </div>
      </div>
    </section>
  );
}
