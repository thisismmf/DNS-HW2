import { json, Router } from "express";
import APIError from "../utils/APIError.js";
import { handleAsync } from "../utils/async.js";
import { AdminTask, db } from "../db.js";
import { z } from "zod";

const admin = Router()

admin.use((req, res, next) => {
    if(!req.session.is_admin)throw new APIError(403, "Forbidden")

    next()
})

admin.get(
    "/tasks",
    handleAsync(async (req, res) => {
        const tasks: AdminTask[] = await db.all(`SELECT * FROM admin_tasks WHERE handled = FALSE`)

        res.status(200).send(tasks ?? [])
    })
)

const taskIdSchema = z.coerce.number().int().nonnegative()
const patchTaskSchema = z.object({
    handled: z.boolean()
})
admin.patch(
    "/tasks/:task_id",
    json(),
    handleAsync(async (req, res) => {
        const taskId = await taskIdSchema.parseAsync(req.params.task_id)
        const { handled } = await patchTaskSchema.parseAsync(req.body)

        const task: AdminTask | null = await db.get(`SELECT * FROM admin_tasks WHERE id = ?`, [taskId])
        if(!task){
            throw new APIError(404, "Not Found")
        }

        await db.run(`UPDATE admin_tasks SET handled = ? WHERE id = ?`, [ handled, taskId ])

        res.status(200).send({})
    })
)

export default admin
