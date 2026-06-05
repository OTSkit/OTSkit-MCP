export type SQLiteValue = string | number | bigint | boolean | null | Uint8Array

export interface DatabaseLike {
  run(sql: string, params?: SQLiteValue[]): { changes: number; lastInsertRowid: number | bigint }
  get(sql: string, params?: SQLiteValue[]): unknown
  all(sql: string, params?: SQLiteValue[]): unknown[]
  exec(sql: string): void
  close(): void
}
