type SqlClient = { query(text: string): Promise<unknown> };

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Unsafe PostgreSQL identifier");
  return `"${value}"`;
}

export async function grantRuntimePrivileges(client: SqlClient, schema: string, role: string): Promise<void> {
  const quotedSchema = quoteIdentifier(schema); const quotedRole = quoteIdentifier(role);
  await client.query(`REVOKE ALL ON SCHEMA ${quotedSchema} FROM ${quotedRole}`);
  await client.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO ${quotedRole}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${quotedSchema} TO ${quotedRole}`);
  await client.query(`REVOKE ALL ON ${quotedSchema}.audit_log FROM ${quotedRole}`);
  await client.query(`GRANT INSERT ON ${quotedSchema}.audit_log TO ${quotedRole}`);
}
