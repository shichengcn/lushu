import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = resolve(root, '.local-data/roadbooks.json')
const outputDirectory = resolve(root, 'dist/data')
const outputPath = resolve(outputDirectory, 'roadbooks.json')

let snapshot
try {
  snapshot = JSON.parse(await readFile(databasePath, 'utf8'))
} catch {
  throw new Error('未找到本地数据库。请先运行 pnpm dev，并在网页中保存一次路书。')
}
if (!snapshot?.savedAt || !Array.isArray(snapshot?.roadbooks) || !snapshot.roadbooks.length) {
  throw new Error('本地数据库格式无效，已停止导出。')
}

const build = spawnSync('pnpm', ['build'], {
  cwd: root,
  stdio: 'inherit',
})
if (build.status !== 0) process.exit(build.status || 1)

await mkdir(outputDirectory, { recursive: true })
await cp(databasePath, outputPath)
await writeFile(
  resolve(outputDirectory, 'export-info.json'),
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      databaseSavedAt: snapshot.savedAt,
      roadbookCount: snapshot.roadbooks.length,
    },
    null,
    2,
  ),
  'utf8',
)

console.log(`已导出 ${snapshot.roadbooks.length} 本路书到 ${outputPath}`)
