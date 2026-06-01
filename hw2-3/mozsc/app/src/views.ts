import { Router, urlencoded } from "express";
import { z } from "zod";
import { handleAsync } from "./utils/async.js";
import { AdminTask, db, formatInsertObject, InsertablePost, Post } from "./db.js";
import { timezone } from "./config.js";
import { TZDate } from "@date-fns/tz";
import { setupPostResolver } from "./params/post_id.js";
import { marked } from "marked";
import createDOMPurify from "dompurify"
import { JSDOM } from "jsdom"
import APIError from "./utils/APIError.js";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);


const views = Router()

setupPostResolver(views)

views.use((req, res, next) => {
    // allow ejs to access session data
    res.locals.session = req.session

    // give timezone utilities to ejs
    res.locals.timezone = timezone
    res.locals.TZDate = TZDate

    next()
})

views.get(
    "/",
    handleAsync(async (req, res) => {
        let query = `SELECT * FROM posts ORDER BY created_at DESC`
        const variables = []
        
        if (!req.session.is_admin) {
            query = `SELECT * FROM posts WHERE author = ? ORDER BY created_at DESC`
            variables.push(req.session.username!)
        }

        const posts: Post[] = await db.all(query, variables)

        res.render("home", {
            posts: posts
        })
    })
)

const createPostSchema = z.object({
    title: z.string().min(1, "Title is required").max(100, "Title too long"),
    body: z.string().min(1, "Body is required")
})
views.post(
    "/",
    urlencoded({ extended: true }),
    handleAsync(async (req, res) => {
        const body = await createPostSchema.parseAsync(req.body)

        const insert: InsertablePost = {
            author: req.session.username!,
            title: body.title,
            body: body.body,
            created_at: Date.now()
        }
        const { fields, values_escape, values } = formatInsertObject(insert)
        const post: Post = await db.get(
            `INSERT INTO posts (${fields}) VALUES (${values_escape}) RETURNING *`,
            values
        )

        res.redirect(`/posts/${post.id}`)
    })
)

views.get(
    "/posts/:post_id",
    handleAsync(async (req, res) => {
        res.render("post", {
            post: req.post,
            body: DOMPurify.sanitize(
                await marked(req.post!.body, { async: true })
            )
        })
    })
)

const reportIdSchema = z.custom(data => {
    const report_id = parseInt(data)
    if(isNaN(report_id))throw new APIError(400, "Invalid Report ID")
    return true
})
views.post(
    "/posts/:report_id/report",
    handleAsync(async (req, res) => {
        const ip = req.header("forwarded") ?? "127.0.0.1"
        const sid = req.sessionID
        const report_id = await reportIdSchema.parseAsync(req.params.report_id)

        // rate limit
        const existing: AdminTask = await db.get(`SELECT * FROM admin_tasks WHERE ip = ? OR sid = ? ORDER BY created_at DESC`, [ip, sid])
        if(existing && existing.created_at + 60 * 1000 > Date.now()) {
            throw new APIError(429, "Rate limit")
        }

        const { fields, values, values_escape } = formatInsertObject({
            post_id: report_id,
            type: "report",
            handled: false,

            created_at: Date.now(),
            ip: ip,
            sid: sid
        })

        await db.run(`INSERT INTO admin_tasks (${fields}) VALUES (${values_escape})`, values)

        res.redirect(`/posts/${report_id}`)
    })
)

export default views