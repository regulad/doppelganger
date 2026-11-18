/**
 * Which of pm2's cluster workers this process is, or "none" outside pm2.
 *
 * pm2 hands a cluster worker its environment as one JSON value, pm2_env, and
 * its own worker script copies that into process.env before loading the app.
 * The server's Sentry client starts earlier than that (node --import), so
 * NODE_APP_INSTANCE isn't in process.env yet and is read from pm2_env instead.
 */
export function getPm2Instance(
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.NODE_APP_INSTANCE) {
    return env.NODE_APP_INSTANCE;
  }
  if (env.pm2_env) {
    try {
      const pm2Env = JSON.parse(env.pm2_env) as Record<string, unknown>;
      const instanceVar =
        typeof pm2Env.instance_var === "string"
          ? pm2Env.instance_var
          : "NODE_APP_INSTANCE";
      const instance = pm2Env[instanceVar];
      if (typeof instance === "number" || typeof instance === "string") {
        return String(instance);
      }
    } catch {
      // not pm2's JSON after all
    }
  }
  return "none";
}
