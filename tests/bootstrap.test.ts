import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const root = path.resolve(__dirname, "..");

function readJson(rel: string): Record<string, unknown> {
  const raw = readFileSync(path.join(root, rel), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("monorepo layout", () => {
  it.each([
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "README.md",
    "apps/web/package.json",
    "apps/web/tsconfig.json",
    "apps/web/vite.config.ts",
    "apps/web/tailwind.config.ts",
    "apps/web/postcss.config.js",
    "apps/web/index.html",
    "apps/web/src/main.tsx",
    "apps/web/src/App.tsx",
    "apps/web/src/styles.css",
    "apps/web/src/test/setup.ts",
    "apps/backend/package.json",
    "apps/backend/tsconfig.json",
    "apps/backend/src/server.ts",
    "apps/backend/src/db/migrate.ts",
    "packages/shared/package.json",
    "packages/shared/tsconfig.json",
    "packages/shared/src/index.ts",
  ])("file %s exists", (relPath) => {
    expect(existsSync(path.join(root, relPath))).toBe(true);
  });
});

describe("workspace config", () => {
  it("pnpm-workspace.yaml lists apps/* and packages/*", () => {
    const raw = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
    const parsed = parseYaml(raw) as { packages?: string[] };
    expect(parsed.packages).toEqual(expect.arrayContaining(["apps/*", "packages/*"]));
  });

  it("root package.json exposes dev + test scripts", () => {
    const pkg = readJson("package.json") as { scripts?: Record<string, string> };
    expect(pkg.scripts?.dev).toBeTruthy();
    expect(pkg.scripts?.test).toBeTruthy();
    expect(pkg.scripts?.dev).toMatch(/apps/);
  });
});

describe("apps/web", () => {
  const pkg = readJson("apps/web/package.json") as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };

  it.each([
    "react",
    "react-dom",
    "react-router-dom",
    "@tanstack/react-query",
    "vite",
    "@vitejs/plugin-react",
    "tailwindcss",
    "postcss",
    "autoprefixer",
    "vitest",
    "jsdom",
    "typescript",
  ])("declares dependency %s", (dep) => {
    expect(all[dep]).toBeTruthy();
  });

  it("declares a test script", () => {
    expect(pkg.scripts?.test).toMatch(/vitest/);
  });

  it("tailwind config carries brand colors", () => {
    const raw = readFileSync(path.join(root, "apps/web/tailwind.config.ts"), "utf8");
    expect(raw).toContain("#0F1B3D");
    expect(raw).toContain("#FF6A1A");
  });

  it("vite config wires up jsdom + setup file", () => {
    const raw = readFileSync(path.join(root, "apps/web/vite.config.ts"), "utf8");
    expect(raw).toContain("jsdom");
    expect(raw).toContain("setup.ts");
  });
});

describe("apps/backend", () => {
  const pkg = readJson("apps/backend/package.json") as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };

  it.each([
    "fastify",
    "@fastify/cors",
    "@fastify/multipart",
    "better-sqlite3",
    "drizzle-orm",
    "drizzle-kit",
    "tsx",
    "typescript",
  ])("declares dependency %s", (dep) => {
    expect(all[dep]).toBeTruthy();
  });

  it("exposes dev + db:migrate scripts", () => {
    expect(pkg.scripts?.dev).toMatch(/tsx/);
    expect(pkg.scripts?.["db:migrate"]).toMatch(/tsx/);
  });

  it("server.ts registers cors and multipart plugins", () => {
    const raw = readFileSync(path.join(root, "apps/backend/src/server.ts"), "utf8");
    expect(raw).toContain("@fastify/cors");
    expect(raw).toContain("@fastify/multipart");
  });
});

describe("packages/shared", () => {
  it("package.json names the @photi/shared package", () => {
    const pkg = readJson("packages/shared/package.json") as { name?: string };
    expect(pkg.name).toBe("@photi/shared");
  });

  it("src/index.ts has at least placeholder content", () => {
    const raw = readFileSync(path.join(root, "packages/shared/src/index.ts"), "utf8");
    expect(raw.trim().length).toBeGreaterThan(0);
  });
});
