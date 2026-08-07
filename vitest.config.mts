import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Purpose:
 * Configures Vitest for the Voya Taxi project.
 *
 * The @ alias must point to /src, just like it does
 * in tsconfig.json.
 *
 * Example:
 * @/lib/pricing/...
 *        ↓
 * src/lib/pricing/...
 */
export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
});