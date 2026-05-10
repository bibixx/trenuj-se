#!/usr/bin/env node
import { config } from "dotenv";

config({ path: ".dev.vars" });

const STRAVA_API = "https://www.strava.com/api/v3/push_subscriptions";

const REQUIRED_ENV = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_VERIFY_TOKEN", "STRAVA_WEBHOOK_PATH_SECRET", "PUBLIC_APP_URL"];

function readEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required env vars in .dev.vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  return {
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    verifyToken: process.env.STRAVA_VERIFY_TOKEN,
    pathSecret: process.env.STRAVA_WEBHOOK_PATH_SECRET,
    appUrl: process.env.PUBLIC_APP_URL.replace(/\/$/, ""),
  };
}

function callbackUrl(env) {
  return `${env.appUrl}/api/strava/webhook/${env.pathSecret}`;
}

async function listSubscriptions(env) {
  const url = new URL(STRAVA_API);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("client_secret", env.clientSecret);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Strava list failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function deleteSubscription(env, id) {
  const url = new URL(`${STRAVA_API}/${id}`);
  const form = new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret });
  const res = await fetch(url, { method: "DELETE", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Strava delete ${id} failed (${res.status}): ${text}`);
  }
}

async function createSubscription(env) {
  const form = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    callback_url: callbackUrl(env),
    verify_token: env.verifyToken,
  });
  const res = await fetch(STRAVA_API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Strava register failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function cmdList() {
  const env = readEnv();
  const subs = await listSubscriptions(env);
  if (subs.length === 0) {
    console.log("No registered subscriptions.");
    return;
  }
  for (const sub of subs) {
    console.log(`#${sub.id}  ${sub.callback_url}  (created ${sub.created_at})`);
  }
}

async function cmdRegister() {
  const env = readEnv();
  const expected = callbackUrl(env);
  const subs = await listSubscriptions(env);

  const matching = subs.find((sub) => sub.callback_url === expected);
  if (matching) {
    console.log(`Subscription already registered: #${matching.id} → ${matching.callback_url}`);
    return;
  }

  for (const sub of subs) {
    console.log(`Deleting stale subscription #${sub.id} (${sub.callback_url})`);
    await deleteSubscription(env, sub.id);
  }

  const created = await createSubscription(env);
  console.log(`Registered subscription #${created.id} → ${expected}`);
}

async function cmdDelete() {
  const env = readEnv();
  const subs = await listSubscriptions(env);
  if (subs.length === 0) {
    console.log("No subscriptions to delete.");
    return;
  }
  for (const sub of subs) {
    console.log(`Deleting #${sub.id} (${sub.callback_url})`);
    await deleteSubscription(env, sub.id);
  }
  console.log("Done.");
}

const command = process.argv[2];
const handlers = { list: cmdList, register: cmdRegister, delete: cmdDelete };
const handler = handlers[command];
if (!handler) {
  console.error("Usage: pnpm strava:webhook <list|register|delete>");
  process.exit(1);
}
handler().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
