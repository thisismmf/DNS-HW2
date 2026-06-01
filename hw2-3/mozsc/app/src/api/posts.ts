import { Router } from "express";
import { db, Post } from "../db.js";
import { z } from "zod";
import APIError from "../utils/APIError.js";
import { handleAsync } from "../utils/async.js";
import { setupPostResolver } from "../params/post_id.js";

const posts = Router()

setupPostResolver(posts)

posts.get("/:post_id", (req, res, next) => {
    res.status(200).json(req.post!)
})

posts.get("/:post_id/:field", (req, res, next) => {
    if(!Object.prototype.hasOwnProperty.call(req.post!, req.params.field)){
        throw new APIError(404, "Field not found")
    }
    const field = req.params.field as keyof Post


    res.status(200).send(req.post![field] as string|number)
})

export default posts