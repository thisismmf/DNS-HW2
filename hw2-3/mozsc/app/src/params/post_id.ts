import { Router } from "express";
import { z } from "zod";
import { handleAsync } from "../utils/async.js";
import { db, Post } from "../db.js";
import APIError from "../utils/APIError.js";

// resolve post_id in params
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        export interface Request {
            post?: Post
        }
    }
}

const postIdParamsSchema = z.object({
    post_id: z.coerce.number().int().positive()
})
export function setupPostResolver(router: Router) {
    router.param(
        "post_id",
        handleAsync(async (req, res, next) => {
            const { post_id } = postIdParamsSchema.parse(req.params)
            
            const post: Post | null = await db.get(
                `SELECT * FROM posts WHERE id = ?`,
                [
                    post_id
                ]
            )
    
            if(!post)throw new APIError(404, "Post not found")

            // prevent guest from seeing other posts
            if(!req.session.is_admin && post.author !== req.session.username){
                throw new APIError(404, "Post not found")
            }
    
            req.post = post
            next()
        })
    )
}