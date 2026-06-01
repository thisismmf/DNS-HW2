import { randomBytes } from "crypto"
import { join } from "path"
import { fileURLToPath } from "url"

export const hostname = process.env.HOSTNAME ?? `0.0.0.0`
export const port = parseInt(process.env.PORT ?? "8080")

if(isNaN(port) || port < 0 || port > 2**16-1 || !Number.isInteger(port)){
    console.error(`Invalid port supplied. Exiting.`)
    process.exit(1)
}

export const cwd = join(
    fileURLToPath(import.meta.url),
    "../.."
)

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? randomBytes(32).toString("hex")
if (!process.env.ADMIN_TOKEN) {
    console.info(`ADMIN_TOKEN not set. Value: ${ADMIN_TOKEN}`)
}

export const timezone = "UTC"