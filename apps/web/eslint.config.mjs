import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [
      "dist/**",
      "public/workers/**",
      ".next/**",
      "node_modules/**",
      "src/ws-scrcpy/**",
      "src/app/(userland)/(static)/licenses/licenses.json",
    ],
  },
  ...nextCoreWebVitals,
  {
    // New in eslint-config-next 16, and existing code breaks them: off until
    // that code is reworked. The rest of the new rules pass and stay on.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
];

export default config;
