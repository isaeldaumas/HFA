import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated, pinned upstream OCR/WASM workers. Byte-for-byte provenance
    // is checked by event-local-ocr-contract.test.mjs; not application code.
    "public/ocr/core/*.wasm.js",
    "public/ocr/worker.min.js",
    "public/ocr/pdf.worker.min.mjs",
  ]),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
]);

export default eslintConfig;
