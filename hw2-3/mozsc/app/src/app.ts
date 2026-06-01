import express from "express"
import { join, relative } from "path"
import { cwd } from "./config.js"
import views from "./views.js"
import api from "./api.js"
import session from "express-session"
import crypto, { randomBytes } from "crypto"
import { db, Secret } from "./db.js"
import SqliteSessionStore from "./SqliteSessionStore.js"
import { z } from "zod"
import { handleAsync } from "./utils/async.js"
import { existsSync, statSync } from "fs"

declare module "express-session" {
    interface SessionData {
        is_admin: boolean | undefined,
        username: string,
        last_report: number | undefined
    }
}

  
const app = express()
app.use(session({
    genid: () => crypto.randomUUID(),
    secret: await (async() => {
        // generate a secure secret and save it to database
        // to prevent logging out everyone at each server restart.
        // especially useful for development where you have to often
        // restart.
        let secret: Secret | undefined = await db.get(`SELECT * FROM secrets WHERE name = 'session_secret'`)
        
        if(!secret){
            secret = await db.get(
                `INSERT INTO secrets (name, value) VALUES ('session_secret', ?) RETURNING *`,
                [
                    crypto.randomBytes(32).toString("hex")
                ]
            ) as Secret
        }

        return secret.value
    })(),
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true
    },
    store: new SqliteSessionStore()
}))

// disable X-Powered-By: Express header
app.disable("x-powered-by")

// setup the templating engine
app.set("views", join(cwd, "views"))
app.set("view engine", "ejs")

// logging all requests
app.use((req, res, next) => {
    // remove useless logging
    if (req.url !== "/api/admin/tasks") {
        console.log(`[${req.method}] ${req.url}`)
    }

    if (!req.session.username) {
        req.session.username = `guest_${randomBytes(3).toString("hex")}`
    }
    
    // only allow content from here (images, css, etc)
    // disable iframes
    res.header("Content-Security-Policy", "default-src 'self'; frame-src 'none';")
    res.header("X-Content-Type-Options", "nosniff")
    res.header("X-Frame-Options", "DENY")

    next()
})

// static content
const assetsQuerySchema = z.object({
    contentType: z.string()
})
const assetsPath = join(cwd, "assets")
app.get(
    "*",
    handleAsync(async (req, res, next) => {
        const { error, data: query } = await assetsQuerySchema.safeParseAsync(req.query)
        if(!error){
            res.header("content-type", query.contentType)
        }

        const path = join(assetsPath, req.path)

        if(!existsSync(path))return next()

        const stat = statSync(path)
        if (!stat.isFile()) return next()

        // doesn't start with assets / path traversal
        if(relative(assetsPath, path).startsWith(".."))return next()
        
        res.sendFile(path)
    })
)

app.use(views)
app.use("/api", api)

export default app