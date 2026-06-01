import "modernlog/patch.js"
import playwright from "playwright"
import { ADMIN_TOKEN, MOZSC_URL } from "./config.js"
import { setTimeout } from "timers/promises"
import { AdminTask } from "./types.js"

console.log("Waiting until server is up")
while(true) {
    try {
        await fetch(MOZSC_URL)
        break
    }catch(err){
        console.error("Server is down.. Waiting..")
        await setTimeout(2000)
    }
}
console.log("Server is up !")

console.log("Launching chromium")
const browser = await playwright.chromium.launch({
    headless: true,
    args: [
        "--no-sandbox",
        "--disable-gpu",
    ]
})

const main = await browser.newPage()

console.log(`Adding admin cookie to bot`)
await main.goto(`${MOZSC_URL}/api/admin_login?admin_token=${encodeURIComponent(ADMIN_TOKEN)}`)

// wait a second
await setTimeout(1000)

while(true) {
    // get available tasks
    // use the browser's fetch functions to keep cookies
    const tasks: AdminTask[] = await main.evaluate(() => {
        return fetch(`/api/admin/tasks`)
            .then(res => res.json())
    })

    for (const task of tasks) {
        console.log(`Processing task`, task.id)

        const page = await browser.newPage()

        // no idea why but the new page loses the cookies ?
        // so go back to admin_login, unload through about:blank, and then load the post
        await page.goto(`${MOZSC_URL}/api/admin_login?admin_token=${encodeURIComponent(ADMIN_TOKEN)}`)
        await page.goto("about:blank")

        await page.goto(`${MOZSC_URL}/posts/${task.post_id}`)

        await setTimeout(5000)

        await page.close()

        // send the handled response
        await main.evaluate(async (id) => {
            return fetch(
                `/api/admin/tasks/${id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        handled: true
                    })
                }
            ).then(res => res.text())
        }, task.id)
    }

    await setTimeout(1000)
}