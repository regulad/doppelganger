import { CopyrightDisclaimer } from "@/components/copyright-disclaimer.tsx";
import type { SiteLink } from "@/components/site/site-navbar.tsx";
import { ReactNode } from "react";
import { Link } from "react-transition-progress/next";

interface SocialLink {
  label: string; // for screen readers, as the link shows only its icon
  url: string;
  icon: ReactNode;
}

interface ContactDetail {
  label: string;
  lines: string[];
}

interface SiteFooterProps {
  logo: ReactNode;
  contactDetails: ContactDetail[];
  linkColumns: SiteLink[][];
  socialLinks: SocialLink[];
  notice: ReactNode; // the small print beside the legal links
  legalLinks: SiteLink[];
}

// The footer of every page: logo, contact details and social links, columns of
// site links, then the small print and legal links under a rule.
export function SiteFooter({
  logo,
  contactDetails,
  linkColumns,
  socialLinks,
  notice,
  legalLinks,
}: SiteFooterProps) {
  return (
    <footer className="px-[5%] py-12 md:py-18 lg:py-20">
      <div className="container">
        <div className="grid gap-12 pb-12 md:gap-16 md:pb-18 lg:grid-cols-[1fr_0.5fr] lg:gap-[4vw] lg:pb-20">
          <div className="flex flex-col items-start gap-6 md:gap-8">
            <Link href="/">{logo}</Link>
            <dl className="flex flex-col gap-5 text-sm md:gap-6">
              {contactDetails.map((detail) => (
                <div key={detail.label}>
                  <dt className="mb-1 font-semibold">{detail.label}</dt>
                  {detail.lines.map((line) => (
                    <dd key={line}>{line}</dd>
                  ))}
                </div>
              ))}
            </dl>
            <ul className="flex gap-3">
              {socialLinks.map((link) => (
                <li key={link.url}>
                  <a href={link.url} aria-label={link.label}>
                    {link.icon}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid items-start gap-x-8 gap-y-10 md:grid-cols-2 md:gap-y-4">
            {linkColumns.map((column, index) => (
              <ul key={index}>
                {column.map((link) => (
                  <li key={link.title} className="py-2 text-sm font-semibold">
                    <Link href={link.url}>{link.title}</Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        <hr className="border-foreground" />
        <div className="flex flex-col-reverse items-start justify-between gap-8 pb-4 pt-6 text-sm md:flex-row md:items-center md:gap-6 md:pb-0 md:pt-8">
          <div>{notice}</div>
          <ul className="flex shrink-0 flex-col gap-4 md:flex-row md:gap-6">
            {legalLinks.map((link) => (
              <li key={link.url} className="underline">
                <Link href={link.url}>{link.title}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-1">
          <CopyrightDisclaimer />
        </div>
      </div>
    </footer>
  );
}
