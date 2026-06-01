import { SessionData, Store } from "express-session";
import { db, formatInsertObject, SqliteSessionData } from "./db.js";

export default class SqliteSessionStore extends Store {
    get(sid: string, callback: (err: any, session?: SessionData | null) => void): void {
        (async () => {
            const session: SqliteSessionData = await db.get(`SELECT * FROM sessions WHERE sid = ?`, [sid])
                
            if (!session) {
                return null
            }

            return JSON.parse(session.data)
        })()
        .then(val => callback(null, val))
        .catch(err => callback(err, null))
    }

    set(sid: string, data: SessionData, callback: (err?: any) => void = ()=>{}): void {
        (async () => {
            const session: SqliteSessionData = await db.get(`SELECT * FROM sessions WHERE sid = ?`, [sid])
                
            if (!session) {
                const { fields, values, values_escape } = formatInsertObject({
                    data: JSON.stringify(data),
                    sid: sid
                })
                await db.run(
                    `INSERT INTO sessions (${fields}) VALUES (${values_escape})`,
                    values
                )
                return
            }

            await db.run(
                `UPDATE sessions SET data = ? WHERE sid = ?`,
                [
                    JSON.stringify(data),
                    sid
                ]
            )

            return JSON.parse(session.data)
        })()
        .then(() => callback())
        .catch(err => callback(err))
    }

    destroy(){}
}