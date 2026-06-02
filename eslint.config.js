// ESLint flat config for Next.js
// Note: Next.js build process includes linting and uses .eslintrc.json
// This config is for standalone ESLint runs
const { FlatCompat } = require("@eslint/eslintrc");
const path = require("path");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  {
    ignores: [
      // Python virtual environment
      "services/zip-avatar-server/venv/**",
      // Build outputs
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",
      // Dependencies
      "node_modules/**",
      // Data directory
      "data/**",
      // Logs
      "*.log",
      "*.jsonl",
      // Test results
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
      // Artifacts
      "artifacts/**",
      // Robot files
      "robot/**",
      // Services
      "services/**",
    ],
  },
  // Use Next.js config via compat layer (may have issues, but build uses .eslintrc.json)
  ...(process.env.ESLINT_NO_COMPAT ? [] : compat.extends("next/core-web-vitals")),
];

