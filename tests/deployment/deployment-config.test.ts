import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("deployment configuration", () => {
  it("keeps host ports out of the base and production Compose files", () => {
    expect(read("compose.yaml")).not.toMatch(/^\s+ports:/m);
    expect(read("compose.prod.yaml")).not.toMatch(/^\s+ports:/m);
    expect(read("compose.dev.yaml")).toMatch(
      /"127\.0\.0\.1:\$\{API_DEV_PORT:-3000\}:3000"/,
    );
    expect(read("compose.dev.yaml")).toMatch(
      /"127\.0\.0\.1:\$\{WEB_DEV_PORT:-5173\}:5173"/,
    );
  });

  it("routes API, health and web through the external Traefik network", () => {
    const production = read("compose.prod.yaml");
    expect(production).toContain("(Path(`/api/v1`) || PathPrefix(`/api/v1/`))");
    expect(production).toContain("Path(`/health`)");
    expect(production).toContain("traefik.http.routers.work-ouch-api.priority");
    expect(production).toContain("traefik.http.routers.work-ouch-web.priority");
    expect(production).toContain("tls.certresolver: letsencrypt");
    expect(production).toMatch(
      /name: \$\{TRAEFIK_NETWORK:\?TRAEFIK_NETWORK is required\}/,
    );
    expect(production).not.toContain("StripPrefix");
  });

  it("separates development data and host dependencies", () => {
    const development = read("compose.dev.yaml");
    expect(development).toContain("training_dev_data:/app/data");
    expect(development).toContain("api_node_modules:/app/node_modules");
    expect(development).toContain("web_node_modules:/app/node_modules");
    expect(development).toContain("WEB_API_PROXY_TARGET: http://api:3000");
    expect(development).toContain('WEB_USE_POLLING: "true"');
  });

  it("serves the SPA without logging query strings or authorization", () => {
    const nginx = read("web/nginx.conf");
    expect(nginx).toContain("try_files $uri $uri/ /index.html;");
    expect(nginx).toContain('Cache-Control "no-store"');
    expect(nginx).toContain("max-age=31536000, immutable");
    expect(nginx).toContain("$request_method !~ ^(GET|HEAD)$");
    expect(nginx).not.toContain("$request_uri");
    expect(nginx).not.toContain("$args");
    expect(nginx.toLowerCase()).not.toContain("authorization");
  });
});
