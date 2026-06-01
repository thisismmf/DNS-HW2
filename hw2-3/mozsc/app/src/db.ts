import { join } from "path"
import { cwd } from "./config.js"
import { mkdir } from "fs/promises"
import sqlite3 from "promised-sqlite3"

const dbPath = join(cwd, "data")
await mkdir(dbPath, { recursive: true })

export const db = await sqlite3.AsyncDatabase.open(
    join(dbPath, "db.sqlite")
)

export interface Count {
    "count(*)": number
}

export interface Secret {
    name: string,
    value: string
}
// create secrets table
await db.run(`CREATE TABLE IF NOT EXISTS secrets (
    name       VARCHAR(100) NOT NULL,
    value      VARCHAR(100) NOT NULL
)`)

export interface Post {
    id: number,
    author: string,
    title: string,
    body: string,
    created_at: number,
}
export type InsertablePost = Omit<Post, "id">

// create posts table
await db.run(`CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    author     VARCHAR(100) NOT NULL,
    title      VARCHAR(100) NOT NULL,
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL
)`)

export function formatInsertObject(object: Record<string, any>) {
    const fields: string[] = []
    const values: string[] = []
    for (const [field, value] of Object.entries(object)) {
        fields.push(field)
        values.push(value)
    }

    return {
        fields: fields,
        values_escape: values.map(() => "?"),
        values: values
    }
}

export interface SqliteSessionData {
    sid: string,
    data: string
}
// create sessions table
await db.run(`CREATE TABLE IF NOT EXISTS sessions (
    sid        VARCHAR(100) PRIMARY KEY,
    data       TEXT NOT NULL
)`)

export interface AdminTask {
    id: number,
    post_id: string,
    type: "report",
    handled: number,
    created_at: number,
    ip: string,
    sid: string,
}
await db.run(`CREATE TABLE IF NOT EXISTS admin_tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    TEXT NOT NULL,
    type       TEXT NOT NULL,
    handled    BOOLEAN NOT NULL CHECK (handled IN (0, 1)),
    created_at INTEGER NOT NULL,
    ip         TEXT NOT NULL,
    sid        TEXT NOT NULL
)`)