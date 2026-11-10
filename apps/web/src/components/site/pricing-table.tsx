import { cn } from "@/lib/utils.ts";
import { ReactNode } from "react";

interface Plan {
  name: string;
  monthlyPrice: string;
  description: string;
  action: ReactNode;
}

interface PlanFeature {
  label: ReactNode;
  values: ReactNode[]; // one per plan, in the order of the plans
}

interface FeatureGroup {
  title?: string;
  features: PlanFeature[];
}

interface PricingTableProps {
  eyebrow: string; // a short line above the heading
  heading: string;
  description: string;
  plans: Plan[];
  featureGroups: FeatureGroup[];
  actions: ReactNode; // one per plan, under the table
}

// Each row lays out as a label column then one column per plan; on phones the
// label takes the whole row and the plans' values sit beneath it.
const rowColumns = "grid grid-cols-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]";

// Plans side by side, with the features they include compared row by row.
export function PricingTable({
  eyebrow,
  heading,
  description,
  plans,
  featureGroups,
  actions,
}: PricingTableProps) {
  return (
    <section className="px-[5%] py-16 md:py-24 lg:py-28">
      <div className="container">
        <div className="mx-auto mb-12 max-w-lg text-center md:mb-18 lg:mb-20">
          <p className="mb-3 font-semibold md:mb-4">{eyebrow}</p>
          <h1 className="mb-5 text-5xl font-bold md:mb-6 md:text-7xl lg:text-8xl">
            {heading}
          </h1>
          <p className="md:text-md">{description}</p>
        </div>
        <div className={cn(rowColumns, "gap-x-4 md:gap-x-8")}>
          <div className="hidden md:block" />
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="flex flex-col justify-between text-center"
            >
              <div>
                <h2 className="text-md font-bold md:text-xl">{plan.name}</h2>
                <p className="my-3 text-2xl font-bold sm:text-6xl md:my-4 md:text-9xl lg:text-10xl">
                  {plan.monthlyPrice}
                  <span className="text-sm sm:text-xl md:text-2xl">/mo</span>
                </p>
                <p>{plan.description}</p>
              </div>
              <div className="mt-6 md:mt-8">{plan.action}</div>
            </div>
          ))}
        </div>
        {featureGroups.map((group, groupIndex) => (
          <div key={group.title ?? groupIndex}>
            {group.title && (
              <h3 className="mt-8 py-5 text-md font-bold md:text-xl">
                {group.title}
              </h3>
            )}
            {group.features.map((feature, featureIndex) => (
              <div
                key={featureIndex}
                className={cn(
                  rowColumns,
                  featureIndex % 2 === 0 && "bg-secondary",
                )}
              >
                <div className="col-span-3 p-4 md:col-span-1 md:px-6">
                  {feature.label}
                </div>
                {feature.values.map((value, planIndex) => (
                  <div
                    key={planIndex}
                    className="flex items-center justify-center p-4 text-center font-semibold md:px-6"
                  >
                    {value}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
        <div className={cn(rowColumns, "mt-8 gap-x-4 md:gap-x-8")}>
          <div className="hidden md:block" />
          {actions}
        </div>
      </div>
    </section>
  );
}
