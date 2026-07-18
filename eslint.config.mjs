import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The book renderer synchronizes React state with a streaming LLM
    // response and imperative audio playback. The React-Compiler-era rules
    // below flag those deliberate patterns (session counters in refs,
    // stream-driven setState inside effects); types are checked by tsc and
    // the flows are exercised live. Relaxed knowingly, not accidentally.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      // Latest-callback refs (ref.current = fn inside an effect) are the
      // standard escape hatch for timers that must call fresh closures.
      "react-hooks/immutability": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
