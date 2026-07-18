import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
}

const sql = postgres(connectionString, {
  max: 1,
  connect_timeout: 20,
  idle_timeout: 5,
});

try {
  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'neon_auth'
    order by table_name
  `;

  console.log(`Neon Auth schema tables: ${tables.length}`);
  for (const table of tables) console.log(`- ${table.table_name}`);

  const configColumns = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'neon_auth' and table_name = 'project_config'
    order by ordinal_position
  `;
  console.log("Project config columns:");
  for (const column of configColumns) console.log(`- ${column.column_name}`);

  const jwksColumns = await sql`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'neon_auth' and table_name = 'jwks'
    order by ordinal_position
  `;
  console.log("JWKS columns:");
  for (const column of jwksColumns) {
    console.log(`- ${column.column_name} (${column.data_type})`);
  }

  const [jwksHealth] = await sql`
    select count(*)::int as key_count
    from neon_auth.jwks
  `;
  console.log(`JWT signing keys available: ${jwksHealth?.key_count ?? 0}`);

  const [config] = await sql`
    select endpoint_id, trusted_origins, social_providers,
           email_and_password, allow_localhost
    from neon_auth.project_config
    limit 1
  `;
  if (config) {
    const providers = Array.isArray(config.social_providers)
      ? config.social_providers
          .map((provider) => provider?.provider ?? provider?.id)
          .filter(Boolean)
      : Object.keys(config.social_providers ?? {});
    console.log(`Auth endpoint id: ${config.endpoint_id || "missing"}`);
    console.log(`Email/password enabled: ${Boolean(config.email_and_password)}`);
    console.log(`Localhost allowed: ${Boolean(config.allow_localhost)}`);
    console.log(`OAuth providers: ${providers.join(", ") || "none"}`);
    console.log(`Trusted origins: ${(config.trusted_origins ?? []).length}`);

    const databaseUrl = new URL(connectionString);
    const hostParts = databaseUrl.hostname.split(".");
    const endpointId = config.endpoint_id;
    const cell = hostParts.find((part) => /^c-\d+$/.test(part));
    const regionIndex = hostParts.findIndex((part) => /^c-\d+$/.test(part)) + 1;
    const region = hostParts[regionIndex];
    const authHosts = [
      cell && region
        ? `${endpointId}.neonauth.${cell}.${region}.aws.neon.tech`
        : null,
      region ? `${endpointId}.neonauth.${region}.aws.neon.tech` : null,
    ].filter(Boolean);

    for (const authHost of [...new Set(authHosts)]) {
      const authUrl = `https://${authHost}/neondb/auth`;
      try {
        const response = await fetch(`${authUrl}/get-session`, {
          headers: { Origin: "https://obseri.com" },
          signal: AbortSignal.timeout(8_000),
        });
        console.log(`Auth candidate ${authUrl}: HTTP ${response.status}`);
      } catch (error) {
        console.log(
          `Auth candidate ${authUrl}: unreachable (${error instanceof Error ? error.name : "error"})`,
        );
      }
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
