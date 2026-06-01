import "modernlog/patch.js"
import app from "./app.js"
import { hostname, port } from "./config.js"
import { Count, db, formatInsertObject, InsertablePost } from "./db.js"

app.listen(port, hostname, () => {
    console.log(`Listening on http://${hostname}:${port}`)
})

// set initial post
create_post: {
    const { "count(*)": count }: Count = await db.get(`SELECT count(*) FROM posts`)
    if(count > 0)break create_post

    console.log(`No post in database: Creating installation successful post...`)

    const post: InsertablePost = {
        author: "system",
        title: `Installation Successful !`,
        body: `The forum installation has been successful ! Thank you for using mozsc.
        
Environment Variables:
\`\`\`
${
    Object.entries(process.env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
}
\`\`\`

`,
        created_at: Date.now(),
    }

    const { fields, values_escape, values } = formatInsertObject(post)
    await db.run(
        `INSERT INTO posts (${fields}) VALUES (${values_escape})`,
        values
    )
}