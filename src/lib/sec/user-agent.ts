/**
 * How Huntr identifies itself to EDGAR. The SEC requires a User-Agent with
 * a contact address and blocks anything that does not declare one; the
 * address is where the SEC writes before it blocks. One value, shared by
 * the app and the ingest pipeline, overridable with SEC_USER_AGENT.
 */
export const SEC_DEFAULT_USER_AGENT = "Huntr huntrvalue.me contact@huntrvalue.me";
