import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || 'lushu'
const skipChecks = args.includes('--skip-checks')
const skipGit = args.includes('--skip-git')
const dryRun = args.includes('--dry-run')
const messageIndex = args.indexOf('--message')
const commitMessage =
  messageIndex >= 0 && args[messageIndex + 1]
    ? args[messageIndex + 1]
    : `chore: publish roadbook ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

function command(program, commandArgs, options = {}) {
  const result = spawnSync(program, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? `\n${result.stderr || result.stdout || ''}` : ''
    throw new Error(`${program} ${commandArgs.join(' ')} 执行失败${detail}`)
  }
  return result
}

function output(program, commandArgs, options = {}) {
  return command(program, commandArgs, { ...options, capture: true }).stdout.trim()
}

function requireLocalConfiguration() {
  const envFiles = ['.env.development.local', '.env.production.local']
  if (envFiles.some((file) => !existsSync(file))) {
    throw new Error('缺少开发或生产环境的本机地图凭据文件')
  }
  if (!existsSync('.local-data/roadbooks.json')) {
    throw new Error('缺少 .local-data/roadbooks.json，请先运行 pnpm dev 并保存路书')
  }
  for (const envFile of envFiles) {
    const ignored = command('git', ['check-ignore', '-q', envFile], {
      capture: true,
      allowFailure: true,
    })
    if (ignored.status !== 0) {
      throw new Error(`${envFile} 未被 Git 忽略，已停止部署`)
    }
  }
}

function verifyStagedSecrets() {
  const envValues = ['.env.development.local', '.env.production.local']
    .flatMap((file) => readFileSync(file, 'utf8').split(/\r?\n/))
    .map((line) => line.match(/^[^#=]+=(.+)$/)?.[1]?.trim())
    .filter((value) => value && value.length >= 12)
  const staged = output('git', ['diff', '--cached', '--no-ext-diff', '--unified=0'])
  if (envValues.some((secret) => staged.includes(secret))) {
    throw new Error('暂存区包含本机环境文件中的凭据，已停止 Git 推送')
  }
}

function publishGit() {
  const remote = output('git', ['remote', 'get-url', 'origin'])
  if (!remote) throw new Error('Git origin 未配置')

  command('git', ['add', '-A'])
  verifyStagedSecrets()
  const staged = command('git', ['diff', '--cached', '--quiet'], {
    capture: true,
    allowFailure: true,
  })
  if (staged.status !== 0) {
    command('git', ['commit', '-m', commitMessage])
  }
  command('git', ['push', 'origin', 'HEAD:main'])
}

function ensurePagesProject() {
  const identity = command('pnpm', ['exec', 'wrangler', 'whoami', '--json'], {
    capture: true,
    allowFailure: true,
  })
  if (identity.status !== 0) {
    throw new Error('Cloudflare CLI 尚未登录，请先运行 pnpm exec wrangler login')
  }

  const list = JSON.parse(
    output('pnpm', ['exec', 'wrangler', 'pages', 'project', 'list', '--json']),
  )
  const projects = Array.isArray(list) ? list : list.result || []
  if (
    !projects.some(
      (project) => project.name === projectName || project['Project Name'] === projectName,
    )
  ) {
    command('pnpm', [
      'exec',
      'wrangler',
      'pages',
      'project',
      'create',
      projectName,
      '--production-branch',
      'main',
    ])
  }
}

function publishCloudflare() {
  ensurePagesProject()
  const commitHash = output('git', ['rev-parse', 'HEAD'])
  const latestMessage = output('git', ['log', '-1', '--pretty=%s'])
  command('pnpm', [
    'exec',
    'wrangler',
    'pages',
    'deploy',
    'dist',
    '--project-name',
    projectName,
    '--branch',
    'main',
    '--commit-hash',
    commitHash,
    '--commit-message',
    latestMessage,
    '--commit-dirty=true',
  ])
}

requireLocalConfiguration()
if (!skipChecks) {
  command('pnpm', ['lint'])
  command('pnpm', ['test'])
}
command('pnpm', ['export:local'])
if (dryRun) {
  console.log('部署预演完成：检查与 dist 导出成功，未推送 GitHub 或 Cloudflare。')
  process.exit(0)
}
if (!skipGit) publishGit()
publishCloudflare()
