import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Source uses NodeNext .js specifiers that point at .ts files.
    extensionAlias: { ".js": [".ts", ".js"] },
  },
  test: {
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
});
