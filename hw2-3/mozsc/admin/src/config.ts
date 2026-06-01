const _ADMIN_TOKEN = process.env.ADMIN_TOKEN
if (!_ADMIN_TOKEN) {
    console.info(`ADMIN_TOKEN not set. Please add environment variable ADMIN_TOKEN.`)
    process.exit(1)
}
export const ADMIN_TOKEN = _ADMIN_TOKEN

export const MOZSC_URL = process.env.MOZSC_URL!