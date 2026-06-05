import { hashFile } from '@otskit/client'

type HashFileSuccess = { hash: string }
type HashFileError = { error: 'file_not_found'; details: string }

export async function hashFileTool(
  input: { path: string }
): Promise<HashFileSuccess | HashFileError> {
  try {
    const buf = await hashFile(input.path)
    return { hash: buf.toString('hex') }
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      return { error: 'file_not_found', details: `File not found: ${input.path}` }
    }
    throw e
  }
}
