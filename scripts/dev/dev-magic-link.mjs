#!/usr/bin/env node
/**
 * Dev-only: generate a magic link via Supabase admin API.
 * Bypasses email entirely — no rate limit, prints the URL to your terminal,
 * you paste it into the browser.
 *
 * Usage:
 *   node scripts/dev/dev-magic-link.mjs your@email.com [redirectTo]
 *
 * redirectTo defaults to production. Pass "http://localhost:3000/auth/callback"
 * for local dev testing.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Hand-roll a tiny .env.local parser so we don't add a dotenv dep.
// Script lives at scripts/dev/dev-magic-link.mjs — .env.local is two levels up.
const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq), l.slice(eq + 1)];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const redirectTo =
  process.argv[3] ?? "https://pklrally.netlify.app/auth/callback";

if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE env vars in .env.local");
  process.exit(1);
}
if (!email) {
  console.error(
    "Usage: node scripts/dev/dev-magic-link.mjs your@email.com [redirectTo]",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo },
});

if (error) {
  console.error("Error generating link:", error.message);
  process.exit(1);
}

// The action_link is Supabase's verify URL. When clicked, it verifies the
// token then redirects to our /auth/callback?token_hash=...&type=magiclink
// (because we updated the email template to use that format).
console.log("\n========================================");
console.log("  MAGIC LINK FOR " + email);
console.log("========================================");
console.log(data.properties.action_link);
console.log("========================================\n");
console.log(
  "Paste the URL above into your browser. Single-use, expires in 1 hour.",
);
