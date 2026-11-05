import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { noComments } from "./eslint-rules/no-comments.js";

const local = {
  rules: {
    "no-comments": noComments,
  },
};

const simRestrictedImports = [
  "error",
  {
    paths: [
      {
        name: "three",
        message: "src/sim cannot import three.",
      },
      {
        name: "xstate",
        message: "src/sim cannot import xstate.",
      },
    ],
    patterns: [
      {
        group: ["three/*", "three/**"],
        message: "src/sim cannot import three.",
      },
      {
        group: ["xstate/*", "xstate/**", "@xstate/*", "@xstate/**"],
        message: "src/sim cannot import xstate.",
      },
      {
        regex: "(^|/)render(/|$)",
        message: "src/sim cannot import render.",
      },
    ],
  },
];

const simRestrictedGlobals = [
  "error",
  {
    name: "window",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "document",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "navigator",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "self",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "localStorage",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "sessionStorage",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "requestAnimationFrame",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "HTMLElement",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "Element",
    message: "src/sim cannot use DOM globals.",
  },
  {
    name: "Node",
    message: "src/sim cannot use DOM globals.",
  },
];

const hotRestrictedSyntax = [
  "error",
  {
    selector: "ObjectExpression",
    message: "Do not allocate object literals in *.hot.ts.",
  },
  {
    selector: "ArrayExpression",
    message: "Do not allocate array literals in *.hot.ts.",
  },
  {
    selector: "NewExpression",
    message: "Do not allocate with new in *.hot.ts.",
  },
  {
    selector: "ArrowFunctionExpression",
    message: "Do not allocate closures in *.hot.ts.",
  },
  {
    selector: "FunctionExpression",
    message: "Do not allocate closures in *.hot.ts.",
  },
  {
    selector: "SpreadElement",
    message: "Do not allocate with spread in *.hot.ts.",
  },
  {
    selector: "CallExpression[callee.property.name='map']",
    message: "Do not allocate with Array#map in *.hot.ts.",
  },
  {
    selector: "CallExpression[callee.property.name='filter']",
    message: "Do not allocate with Array#filter in *.hot.ts.",
  },
  {
    selector: "CallExpression[callee.property.name='slice']",
    message: "Do not allocate with Array#slice in *.hot.ts.",
  },
  {
    selector: "CallExpression[callee.property.name='concat']",
    message: "Do not allocate with Array#concat in *.hot.ts.",
  },
  {
    selector: "TemplateLiteral[expressions.length>0]",
    message: "Do not build strings with template expressions in *.hot.ts.",
  },
  {
    selector: "BinaryExpression[operator='+'] > Literal[raw=/^['\"]/]",
    message: "Do not concatenate strings in *.hot.ts.",
  },
  {
    selector: "AssignmentExpression[operator='+='] > Literal[raw=/^['\"]/]",
    message: "Do not concatenate strings in *.hot.ts.",
  },
];

const simRestrictedProperties = [
  "error",
  {
    object: "Math",
    property: "random",
    message: "src/sim cannot use Math.random.",
  },
  {
    object: "Date",
    property: "now",
    message: "src/sim cannot use Date.now.",
  },
  {
    object: "performance",
    property: "now",
    message: "src/sim cannot use performance.now.",
  },
];

export default tseslint.config(
  { ignores: ["dist", "proof", "node_modules", "fixtures/eslint"] },
  {
    plugins: { local },
    rules: {
      "local/no-comments": "error",
    },
  },
  eslint.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: false },
      ],
    },
  },
  {
    files: ["src/sim/**/*.ts", "fixtures/eslint/sim/**/*.ts"],
    rules: {
      "no-restricted-globals": simRestrictedGlobals,
      "no-restricted-imports": simRestrictedImports,
      "no-restricted-properties": simRestrictedProperties,
    },
  },
  {
    files: ["**/*.hot.ts"],
    rules: {
      "no-restricted-syntax": hotRestrictedSyntax,
    },
  },
);
