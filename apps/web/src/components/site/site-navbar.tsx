"use client";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { LuMenu, LuX } from "react-icons/lu";
import { Link } from "react-transition-progress/next";

export interface SiteLink {
  title: string;
  url: string;
}

interface SiteNavbarProps {
  logo: ReactNode;
  links: SiteLink[];
  actions: ReactNode; // shown after the links, e.g. login and theme buttons
}

// The bar across the top of every page. Below the lg breakpoint, the links and
// actions fold into a full-height menu behind a toggle button.
export function SiteNavbar({ logo, links, actions }: SiteNavbarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b bg-background px-[5%]">
      <nav
        aria-label="Main"
        className="flex flex-wrap items-center justify-between lg:min-h-18 lg:flex-nowrap"
      >
        <div className="flex min-h-16 w-full items-center justify-between md:min-h-18 lg:w-auto">
          <Link href="/">{logo}</Link>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="site-navbar-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <LuX className="size-6" />
            ) : (
              <LuMenu className="size-6" />
            )}
            <span className="sr-only">
              {menuOpen ? "Close menu" : "Open menu"}
            </span>
          </Button>
        </div>
        <div
          id="site-navbar-menu"
          className={cn(
            "h-[calc(100dvh-4rem)] w-full overflow-y-auto pt-4 md:h-[calc(100dvh-4.5rem)] lg:flex lg:h-auto lg:w-auto lg:items-center lg:overflow-visible lg:pt-0",
            !menuOpen && "hidden",
          )}
        >
          <ul className="lg:flex lg:items-center">
            {links.map((link) => {
              const current = link.url === pathname;
              return (
                <li key={link.url}>
                  <Link
                    href={link.url}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "block py-3 text-md lg:px-4 lg:py-2 lg:text-base",
                      current && "font-bold",
                    )}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.title}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-col items-center gap-4 lg:ml-4 lg:mt-0 lg:flex-row">
            {actions}
          </div>
        </div>
      </nav>
    </header>
  );
}
