// @ts-check
import withMdxFactory from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs/config";
import { PHASE_PRODUCTION_SERVER } from "next/constants.js";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";

// From Next.js 16.2, webpack builds compile MDX pages outside the React Server
// Components layer, then reject their `export const metadata` as if they were
// Client Components (vercel/next.js#91735; Turbopack is unaffected). This gives
// the MDX rule's SWC loader that layer on the server, as the upstream fix
// (vercel/next.js#95057) does. The loader entry is copied rather than changed
// in place, as other rules may share it. Remove this once a release fixes it.
const pinMdxToServerComponents = (rules) => {
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    if (rule.test instanceof RegExp && rule.test.test("page.mdx")) {
      const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
      rule.use = uses.map((entry) =>
        typeof entry?.loader === "string" &&
        entry.loader.includes("next-swc-loader") &&
        entry.options?.bundleLayer == null
          ? { ...entry, options: { ...entry.options, bundleLayer: "rsc" } }
          : entry,
      );
    }
    if (Array.isArray(rule.oneOf)) pinMdxToServerComponents(rule.oneOf);
    if (Array.isArray(rule.rules)) pinMdxToServerComponents(rule.rules);
  }
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // for sentry profiling
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Document-Policy",
            value: "js-profiling",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/pricing",
        destination: "/subscribe",
        permanent: true,
        has: [
          {
            type: "query",
            key: "redirect",
            value: "pricing",
          },
        ],
      },
      {
        source: "/premium",
        destination: "/subscribe",
        permanent: true,
        has: [
          {
            type: "query",
            key: "redirect",
            value: "premium",
          },
        ],
      },
      {
        source: "/dashboard",
        destination: "/devices",
        permanent: true,
        has: [
          {
            type: "query",
            key: "redirect",
            value: "dashboard",
          },
        ],
      },
    ];
  },
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  output: "standalone",
  experimental: {
    // do not disable it
    forceSwcTransforms: true,
  },
  // These ship only ES modules. Next bundles them either way; listing them
  // here is for jest, which next/jest has compile only the node_modules
  // packages named here, and which can't load ES modules uncompiled.
  transpilePackages: ["@paralleldrive/cuid2", "@noble/hashes"],
  // ignore sentry utils from server action bundling
  serverExternalPackages: [
    // we load these in our server functions, if i ever split this won't be required
    "@sentry/node",
  ],
  // coding assistance for routes
  typedRoutes: true,
  // https://nextjs.org/docs/pages/api-reference/next-config-js/reactStrictMode
  reactStrictMode: true,
  // https://nextjs.org/docs/app/api-reference/next-config-js/webpack
  // https://webpack.js.org/loaders/node-loader/
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.module.rules = [
        {
          test: /\.node$/,
          loader: "node-loader",
        },
        ...config.module.rules,
      ];
      pinMdxToServerComponents(config.module.rules);
    }
    config.module.rules = [
      {
        test: /\.svg$/,
        loader: "svg-inline-loader",
      },
      ...config.module.rules,
    ];
    return config;
  },
  // turbopack is too experimental; let's not use it
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true, // already checked by pre-commit, saves time in docker builds
  },
};

const sentryConfig = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: "regulad",
  project: "doppelganger",

  // Off: in @sentry/nextjs 11.10 this plugin prepends a marker to each server
  // entry bundle after webpack has written its source map, so every frame on
  // that bundle's first line (all of its minified code) resolves to the wrong
  // place. It only compiles tracing hooks into bundled packages (ioredis);
  // the server's early Sentry setup instruments them at runtime instead.
  buildTimeInstrumentation: false,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Fail the build when creating the release or uploading source maps fails,
  // which would otherwise only be logged (and not at all while silent).
  // Without an auth token the plugin skips both with a warning instead, so
  // builds without one still pass.
  errorHandler: (err) => {
    throw err;
  },

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Client source maps are hidden by default since Sentry v9 (hideSourceMaps
  // was removed)
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  webpack: {
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    treeshake: {
      removeDebugLogging: true,
    },

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  },
});

const mdxConfig = withMdxFactory({
  extension: /\.(md|mdx)$/,
  options: {
    remarkPlugins: [remarkGfm, remarkToc, remarkFrontmatter],
    rehypePlugins: [],
  },
})(sentryConfig);

// withContentlayer only hooks Contentlayer into webpack builds and the dev
// server, so the production server has no use for it. Importing it loads
// contentlayer2's OpenTelemetry tracing, about 250 modules, which held up
// every server start, long enough after a deploy to set off Sentry's
// 5-second ANR detection. So it's imported only for the other phases.
/** @type {(phase: string) => Promise<import('next').NextConfig>} */
export default async function config(phase) {
  if (phase === PHASE_PRODUCTION_SERVER) {
    return mdxConfig;
  }
  const { withContentlayer } = await import("next-contentlayer2");
  return withContentlayer(mdxConfig);
}
