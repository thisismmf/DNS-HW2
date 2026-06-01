import { NextFunction, Request, RequestHandler, Response } from "express"
import * as core from "express-serve-static-core"

export function handleAsync<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
    Locals extends Record<string, any> = Record<string, any>,
>(
    handler: RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>
): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> {
    return async (req, res, next) => {
        try{
            await handler(req, res, next)
        }catch(err){
            (next as NextFunction)(err)
        }
    }
}