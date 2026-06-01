import { NextFunction, Request, Response, Router } from "express";
import APIError from "./utils/APIError.js";
import posts from "./api/posts.js";
import { handleAsync } from "./utils/async.js";
import { z } from "zod";
import { ADMIN_TOKEN } from "./config.js";
import admin from "./api/admin.js";

const api = Router()

api.use("/posts", posts)
api.use("/admin", admin)

const adminLoginQuery = z.object({
    admin_token: z.string().default("")
})
api.get(
    `/admin_login`,
    handleAsync(async (req, res) => {
        const { admin_token } = await adminLoginQuery.parseAsync(req.query)
        
        if (admin_token !== ADMIN_TOKEN) {
            throw new APIError(401, "admin_token do not match.")
        }

        req.session.username = `admin`
        req.session.is_admin = true

        res.status(200).send(req.session)
    })
)

api.use(() => {
    throw new APIError(404, "Not Found")
})

api.use((err:Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof APIError) {
        res.status(err.status).send({
            error: err.message
        })
        return
    }

    console.error(`[${req.method}] ${req.url} An error occured:`, err)
    res.status(500).send({
        error: err.message
    })
})

export default api