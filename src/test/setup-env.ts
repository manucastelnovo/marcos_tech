import { config } from "dotenv";

/**
 * Integration tests run against their own database so a failing test can never
 * touch the shop's data. Loaded before any module reads process.env.
 */
config({ path: ".env.test", override: true });
