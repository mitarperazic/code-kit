import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'project-tree'
const open = atom({ plugin: 'code-kit', key: 'open' } as const, [], {
  shape: 'open-1',
})

const file = atom({ plugin: 'code-kit', key: 'file' } as const, '', { shape: 'file-1' })
const draft = atom({ plugin: 'code-kit', key: 'draft' } as const, '', { shape: 'draft-1' })
const rev = atom({ plugin: 'code-kit', key: 'rev' } as const, 0, { shape: 'rev-1' })

const edited = atom({ plugin: 'code-kit', key: 'edited' } as const, [], { shape: 'edited-1' })

// The folder Claude was started in: pinned once, never follows Claude's own cd.
const home = atom({ plugin: 'code-kit', key: 'home' } as const, '', { shape: 'home-1' })
const rootDir = async ($: any): Promise<string> => {
  const pinned = await read($, home)
  if (pinned) return pinned
  const cwd = await $.session.cwd()
  await update($, home, () => cwd)

  return cwd
}

// What Claude is looking at now: the panel stays on the folder Claude was started in (rootDir),
// the status line follows this one (project and branch). It moves when Claude's shell changes folder
// and when a tool touches a file inside a git repository; a file outside any repository (a temp
// folder, say) leaves it where it was. Resolved to the repository's top so a subfolder is not a "change".
let focusDir = ''
const statusDir = async ($: any): Promise<string> => focusDir || (await rootDir($))
async function focusOn($: any, dir: string, mustBeRepo: boolean) {
  if (!dir || !dir.startsWith('/')) return
  let target = dir
  try {
    const top = await $.process.run(['git', '--no-optional-locks', 'rev-parse', '--show-toplevel'], { cwd: dir })
    if (top.exitCode === 0 && top.stdout.trim()) target = top.stdout.trim()
    else if (mustBeRepo) return
  } catch {
    if (mustBeRepo) return
  }
  if (target === (await statusDir($))) return
  focusDir = target
  statusAt = 0
  gitAt = 0
  await updateStatus($)
}

const CHANGES = 'project-changes'
const tick = atom({ plugin: 'code-kit', key: 'tick' } as const, 0, { shape: 'tick-1' })
// What the search field holds: the tree shows only the files and folders whose name contains it.
const query = atom({ plugin: 'code-kit', key: 'query' } as const, '', { shape: 'query-1' })
const chgOff = atom({ plugin: 'code-kit', key: 'chgOff' } as const, 0, { shape: 'chgoff-1' })
const treeOff = atom({ plugin: 'code-kit', key: 'treeOff' } as const, 0, { shape: 'off-1' })
const wheel = atom({ plugin: 'code-kit', key: 'wheel' } as const, 0, { shape: 'wheel-1' })
const hwheel = atom({ plugin: 'code-kit', key: 'hwheel' } as const, 0, { shape: 'hwheel-1' })
const editCols = atom({ plugin: 'code-kit', key: 'editCols' } as const, 0, { shape: 'edcols-1' })
const copied = atom({ plugin: 'code-kit', key: 'copied' } as const, '', { shape: 'copied-1' })
let copyToken = 0
const treeMax = atom({ plugin: 'code-kit', key: 'treeMax' } as const, 0, { shape: 'max-1' })

// Dock caps at 45% of the terminal, so a large ask gives the widest right-hand half.
const COLS = 200
// A Client's props and posts are capped at 100000 characters serialized.
const MAX_EDIT = 60000

// The panel belongs to projects only: any project marker in the working folder.
const MARKERS = ['.git', 'package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'Makefile', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Package.swift', 'Gemfile', 'composer.json']
const isProject = async ($: any): Promise<boolean> => {
  try {
    const root = await rootDir($)
    for (const m of MARKERS) {
      if (await $.fs.exists(root + '/' + m)) return true
    }
  } catch {}

  return false
}

// What the person turned on with /code-kit:config, kept in ~/.claude/code-kit.json (absent = everything on):
// panel = the structure and editor pane, stats = the status line under the prompt.
let cfg = { panel: true, stats: true, icons: false }
let cfgRaw = ''
async function loadConfig($: any): Promise<boolean> {
  let raw = ''
  try {
    raw = await $.fs.read((await homeSettings($)).replace(/settings\.json$/, 'code-kit.json'))
  } catch {}
  if (raw === cfgRaw) return false
  cfgRaw = raw
  let j: any = {}
  try {
    j = JSON.parse(raw || '{}')
  } catch {}
  // panel and stats are on unless turned off; icons (they need a Nerd Font) and rules are off unless turned on.
  const next = { panel: j.panel !== false, stats: j.stats !== false, icons: j.icons === true }
  const changed = next.panel !== cfg.panel || next.stats !== cfg.stats || next.icons !== cfg.icons
  cfg = next

  return changed
}

// force: the person asked for the panel (/code-kit), so the saved choice does not hold it back.
const openPanels = async ($: any, focus = false, force = false) => {
  if (!force && !cfg.panel) {
    void $.ui.close({ id: PANE })
    void $.ui.close({ id: CHANGES })
    return
  }
  if (!(await isProject($))) {
    void $.ui.close({ id: PANE })
    void $.ui.close({ id: CHANGES })
    return
  }
  void $.ui.open({ id: PANE, title: 'STRUKTURA', columns: COLS, ...(focus ? { focus: true } : {}) })
  // One pane only, so the engine draws no tab strip.
  void $.ui.close({ id: CHANGES })
}

const SKIP = new Set(['node_modules', '.git', '.gradle', 'build', 'dist', '.next', '.DS_Store', '__pycache__', '.venv'])
const MAX_ROWS = 400


// File-type icons for the tree: Nerd Font glyphs, so the terminal's font must be a Nerd Font (JetBrainsMono Nerd Font,
// say). Shown only when chosen in /code-kit:config (cfg.icons); otherwise a plain dot.
const g = (n: number) => String.fromCodePoint(n)
const ICON_BY_EXT: Record<string, [string, string]> = {
  js: [g(0xe74e), '#f1e05a'], mjs: [g(0xe74e), '#f1e05a'], cjs: [g(0xe74e), '#f1e05a'],
  ts: [g(0xe628), '#3178c6'], tsx: [g(0xe7ba), '#61dafb'], jsx: [g(0xe7ba), '#61dafb'],
  json: [g(0xe60b), '#cbcb41'], html: [g(0xe736), '#e44d26'], htm: [g(0xe736), '#e44d26'],
  css: [g(0xe749), '#42a5f5'], scss: [g(0xe749), '#f06292'], sass: [g(0xe749), '#f06292'], less: [g(0xe749), '#42a5f5'],
  py: [g(0xe73c), '#4b8bbe'], java: [g(0xe738), '#e76f00'], kt: [g(0xe634), '#a97bff'], kts: [g(0xe634), '#a97bff'],
  go: [g(0xe627), '#00add8'], rs: [g(0xe7a8), '#dea584'], rb: [g(0xe739), '#cc342d'], php: [g(0xe73d), '#8892bf'],
  md: [g(0xe73e), '#7ab8d9'], txt: [g(0xf15c), '#9aa0ab'], log: [g(0xf15c), '#9aa0ab'],
  yml: [g(0xe6a8), '#cb6b6b'], yaml: [g(0xe6a8), '#cb6b6b'], toml: [g(0xe615), '#9c4221'], xml: [g(0xe619), '#e37933'],
  properties: [g(0xe615), '#9aa0ab'], conf: [g(0xe615), '#9aa0ab'], env: [g(0xe615), '#ecd53f'], ini: [g(0xe615), '#9aa0ab'],
  sql: [g(0xe706), '#dad8d8'], sh: [g(0xf489), '#89e051'], bash: [g(0xf489), '#89e051'], zsh: [g(0xf489), '#89e051'],
  vue: [g(0xe6a0), '#41b883'], svg: [g(0xf1c5), '#ffb13b'],
  png: [g(0xf1c5), '#a074c4'], jpg: [g(0xf1c5), '#a074c4'], jpeg: [g(0xf1c5), '#a074c4'], gif: [g(0xf1c5), '#a074c4'], webp: [g(0xf1c5), '#a074c4'], ico: [g(0xf1c5), '#a074c4'],
  pdf: [g(0xf1c1), '#e5534b'], zip: [g(0xf1c6), '#c9a227'], gz: [g(0xf1c6), '#c9a227'], jar: [g(0xe738), '#e76f00'],
  lock: [g(0xf023), '#7d8590'], gradle: [g(0xe660), '#5b9bd5'],
}
const ICON_BY_NAME: Record<string, [string, string]> = {
  dockerfile: [g(0xe7b0), '#2496ed'], '.gitignore': [g(0xe702), '#f05133'], '.gitattributes': [g(0xe702), '#f05133'],
  'package.json': [g(0xe71e), '#8bc34a'], 'pom.xml': [g(0xe738), '#e76f00'], makefile: [g(0xe615), '#9aa0ab'],
}
const DEFAULT_ICON: [string, string] = [g(0xf15b), '#9aa0ab']
const iconOf = (name: string): [string, string] => {
  if (!cfg.icons) return ['•', '#5c6370']
  const n = name.toLowerCase()
  return ICON_BY_NAME[n] ?? ICON_BY_EXT[n.slice(n.lastIndexOf('.') + 1)] ?? DEFAULT_ICON
}

type Row = { path: string; name: string; depth: number; isDir: boolean }

// What the pane last knew of the open file (loaded or autosaved), to tell outside edits from its own.
let known = ''
// Which file `known` belongs to. A plugin reload empties the module's variables while the open file
// (an atom) stays: without this the file would be diffed against '' and every line shown as newly written.
let knownPath = ''
async function ensureKnown($: any): Promise<void> {
  const path = await read($, file)
  if (!path || knownPath === path) return
  try {
    known = await $.fs.read(path)
  } catch {
    known = ''
  }
  knownPath = path
}

// The editor's window as an absolute first row, so the wheel can clamp at both ends
// (a running total drifts past the ends and leaves a dead zone on the way back).
let editTop = 0
let editRows = 20
const WHEEL_STEP = 3
// Sideways, the same way: the first column shown, moved by the wheel while shift is held.
let editLeft = 0
let editCols2 = 60
let shiftHeld = false

// The walked tree, kept until the tree, the open folders or the project change.
let treeKey = ''
let treeRows: Row[] = []
// How many rows the tree shows right now (filtered or not): what the wheel clamps by.
let wheelRows = 0
// The changed-files list under the tree: its first row in the pane body, its height and how many rows it holds.
let chgFrom = -1
let chgHeight = 0
let chgCount = 0
// Every file and folder of the project, for the search (rebuilt when a file changes).
const MAX_INDEX = 20000
let indexRows: Row[] = []
let indexKey = ''
// Rows the tree window shows and the editor's width, as last drawn: what the wheel clamps by.
let treeHeight = 20

// Git state of the project (absolute paths): new files, changed files and the folders holding them.
let gitNew = new Set<string>()
// Deleted files (they no longer exist on disk, so the tree cannot show them) and +/- line counts per changed file.
let gitDel = new Set<string>()
let gitStat = new Map<string, [number, number]>()
let gitStatKey = ''
let gitMod = new Set<string>()
let gitNewDirs = new Set<string>()
let gitModDirs = new Set<string>()
// Folders holding at least one file git already tracks: a folder outside this set is new itself.
let gitTrackedDirs = new Set<string>()
let gitAt = 0
// Lines of the open file as git sees them against HEAD, by 0-based line: 'g' added (green; every line of a new
// file), '+' changed (blue: replaces an old line), '-' (blue) where lines were only taken out. Nothing here comes
// from the session: it is the same on every start, and a change by anyone shows once the file is on disk.
let gitLines: Marks = {}
let gitLinesFor = ''
let gitLinesText = ''
// The open file as committed (HEAD), line by line: what the revert button restores. null = not known.
let gitBase: string[] | null = null
async function loadBase($: any, path: string): Promise<string[] | null> {
  if (gitNew.has(path)) return []
  try {
    const i = path.lastIndexOf('/')
    const r = await $.process.run(['git', '--no-optional-locks', 'show', 'HEAD:./' + path.slice(i + 1)], { cwd: path.slice(0, i) })
    if (r.exitCode !== 0) return null
    const t = String(r.stdout).replace(/\r/g, '')
    if (t.length > 2_000_000) return null
    return t === '' ? [''] : t.split('\n')
  } catch {
    return null
  }
}
async function computeGitLines($: any, root: string, path: string, text: string): Promise<Marks> {
  const out: Marks = {}
  try {
    const total = text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
    if (gitNew.has(path)) {
      for (let i = 0; i < total; i++) out[i] = 'g'
    } else if (gitMod.has(path)) {
      const r = await $.process.run(['git', '--no-optional-locks', 'diff', '-U0', '--no-color', 'HEAD', '--', path], { cwd: root })
      const removed: number[] = []
      for (const ln of r.stdout.split('\n')) {
        const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(ln)
        if (!m) continue
        const oldN = m[2] === undefined ? 1 : Number(m[2])
        const start = Number(m[3])
        const newN = m[4] === undefined ? 1 : Number(m[4])
        if (newN === 0) removed.push(Math.min(Math.max(0, total - 1), start))
        else for (let i = 0; i < newN; i++) out[start - 1 + i] = i < oldN ? '+' : 'g'
      }
      for (const at of removed) if (!out[at]) out[at] = '-'
    }
  } catch {}

  return out
}
async function loadGit($: any, root: string): Promise<boolean> {
  let now = 0
  try {
    now = await $.clock.now()
  } catch {}
  if (now && now - gitAt < 4000) return false
  gitAt = now
  try {
    const top = await $.process.run(['git', '--no-optional-locks', 'rev-parse', '--show-toplevel'], { cwd: root })
    if (top.exitCode !== 0) return false
    const base = top.stdout.trim()
    const st = await $.process.run(['git', '--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all'], { cwd: root })
    if (st.exitCode !== 0) return false
    const nn = new Set<string>()
    const mm = new Set<string>()
    const dd = new Set<string>()
    const parts = st.stdout.split('\0')
    for (let i = 0; i < parts.length; i++) {
      const ent = parts[i]
      if (ent.length < 4) continue
      const x = ent[0]
      const y = ent[1]
      const path = base + '/' + ent.slice(3)
      if (x === 'R' || x === 'C') i++
      if (x === 'D' || y === 'D') {
        dd.add(path)
        continue
      }
      if ((x === '?' && y === '?') || x === 'A') nn.add(path)
      else mm.add(path)
    }
    const dirsOf = (set: Set<string>) => {
      const out = new Set<string>()
      for (const f of set) {
        let d = f.slice(0, f.lastIndexOf('/'))
        while (d.length > root.length && !out.has(d)) {
          out.add(d)
          d = d.slice(0, d.lastIndexOf('/'))
        }
      }

      return out
    }
    const ls = await $.process.run(['git', '--no-optional-locks', 'ls-files', '-z'], { cwd: root })
    const tracked = new Set<string>()
    if (ls.exitCode === 0) {
      for (const rel of ls.stdout.split('\0')) {
        let i = rel.lastIndexOf('/')
        while (i > 0) {
          const d = base + '/' + rel.slice(0, i)
          if (tracked.has(d)) break
          tracked.add(d)
          i = rel.lastIndexOf('/', i - 1)
        }
      }
    }
    gitTrackedDirs = tracked
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x))
    const stat = new Map<string, [number, number]>()
    try {
      const ns = await $.process.run(['git', '--no-optional-locks', 'diff', 'HEAD', '--numstat'], { cwd: root })
      if (ns.exitCode === 0) {
        for (const l of ns.stdout.split('\n')) {
          const [a, b, rel] = l.split('\t')
          if (rel) stat.set(base + '/' + rel, [Number(a) || 0, Number(b) || 0])
        }
      }
    } catch {}
    const statKey = JSON.stringify([...stat])
    const changed = !same(nn, gitNew) || !same(mm, gitMod) || !same(dd, gitDel) || statKey !== gitStatKey
    gitNew = nn
    gitMod = mm
    gitDel = dd
    gitStat = stat
    gitStatKey = statKey
    gitNewDirs = dirsOf(nn)
    gitModDirs = dirsOf(mm)

    return changed
  } catch {
    return false
  }
}
let editColsLive = 0
// The row of the pane body where the editor's sideways-scroll bar is drawn.
let barRow = -1

async function openFile($: any, path: string) {
  let text = ''
  try {
    text = await $.fs.read(path)
  } catch {
    text = ''
  }
  known = text
  knownPath = path
  gitLines = {}
  gitLinesFor = ''
  editTop = 0
  editLeft = 0
  await update($, wheel, () => 0)
  await update($, hwheel, () => 0)
  await update($, file, () => path)
  await update($, draft, () => text)
  await update($, rev, n => n + 1)
}

// True from the start of a turn to its end: a change to the open file in between is Claude's.
let busy = false

// '+' and '-' (blue) and 'g' (green) marks of a line, see computeGitLines.
type Marks = Record<number, '+' | '-' | 'g'>

// Files Claude touched (absolute paths); the tree tints them and their folders.
// force: a file just written is shown even when it was marked before (the mark outlives the edit; the editor must not).
async function markEdited($: any, paths: string[], openIt = false, force = false) {
  const have = new Set(await read($, edited))
  const fresh = paths.filter(p => p && !have.has(p))
  if (fresh.length) await update($, edited, list => [...list, ...fresh.filter(p => !list.includes(p))])
  const shownList = force ? paths.filter(Boolean) : fresh
  if (openIt && shownList.length) {
    const last = shownList[shownList.length - 1]
    if ((await read($, file)) !== last) await openFile($, last)
  }
}

// The clipboard, read from the system (the editor has no way to ask for it): null when nothing could be read.
async function readClipboard($: any): Promise<string | null> {
  const tools = [['pbpaste'], ['wl-paste', '--no-newline'], ['xclip', '-selection', 'clipboard', '-o'], ['powershell', '-NoProfile', '-Command', 'Get-Clipboard -Raw']]
  for (const argv of tools) {
    try {
      const r = await $.process.run(argv)
      if (r.exitCode === 0) return String(r.stdout)
    } catch {}
  }

  return null
}
// A paste on its way into the editor (id grows; the editor puts each id in once). Dropped after two seconds.
let pasteBox: { id: number; text: string } | null = null
const MAX_PASTE = 20000

// Modification time of the last write the editor itself made, by path.
const ownWrite = new Map<string, number>()
// Autosave state: while the editor's text is on its way to disk (or was just typed), the disk copy is older than
// the editor's and must not be mistaken for an outside change.
let pendingWrite: { path: string; text: string } | null = null
let flushing = false
let lastEditAt = 0
let turnStart = 0

// Bring the panel up to date: the open file, then the tree. Quiet (the timer) it redraws
// only when the open file changed, so an idle panel costs a file read a second.
async function refresh($: any, quiet = false, byClaude = busy) {
  if (await loadConfig($)) {
    if (cfg.panel) await openPanels($)
    else void $.ui.close({ id: PANE })
    statusAt = 0
    await update($, stick, n => n + 1)
    await update($, tick, n => n + 1)
  }
  if (!cfg.panel) {
    if (cfg.stats) void updateStatus($)
    return
  }
  void updateStatus($)
  await ensureKnown($)
  const gitChanged = await loadGit($, await rootDir($))
  let changed = (await syncOpenFile($, byClaude)) || gitChanged
  const cur = await read($, file)
  if (cur && (gitChanged || changed || gitLinesFor !== cur || gitLinesText !== known)) {
    gitLinesFor = cur
    gitLinesText = known
    const next = await computeGitLines($, await rootDir($), cur, known)
    const base = await loadBase($, cur)
    const baseChanged = JSON.stringify(base) !== JSON.stringify(gitBase)
    gitBase = base
    if (baseChanged || JSON.stringify(next) !== JSON.stringify(gitLines)) {
      gitLines = next
      await update($, rev, n => n + 1)
      changed = true
    }
  }
  if (!quiet || changed) await update($, tick, n => n + 1)
}

// An edit made outside the editor (Claude, git, another editor) reloads the open file.
async function syncOpenFile($: any, byClaude: boolean): Promise<boolean> {
  const path = await read($, file)
  if (!path) return false
  if (flushing || pendingWrite || Date.now() - lastEditAt < 1500) return false
  const startedAt = Date.now()
  let text: string
  try {
    text = await $.fs.read(path)
  } catch {
    return false
  }
  if (flushing || pendingWrite || lastEditAt >= startedAt - 5) return false
  if (text === known) return false
  known = text
  await update($, draft, () => text)
  await update($, rev, n => n + 1)

  return true
}

// The status line pinned under the prompt, drawn like the one in settings.json (same data, same colours).
let ramAt = 0
let statusAt = 0
let ramPct: number | null = null
let ramTxt = ''
// Colours of the settings.json status line, as hex (the band draws Text colours, not escape codes).
const ORANGE = '#d97757'
const LABEL = '#bcbcbc'
const DIM = '#808080'
const TRACK = '#444444'
const WHITE = '#eeeeee'
const HOT = '#ff5f5f'
const GREEN = '#5fd787'
type Seg = { t: string; c?: string; b?: boolean; k?: 'name' | 'branch' }
let statusSegs: Seg[] = []
const stick = atom({ plugin: 'code-kit', key: 'stick' } as const, 0, { shape: 'stick-1' })
const sep = (): Seg[] => [{ t: '  ' }, { t: '┃', c: TRACK }, { t: '  ' }]
const sbar = (v: number | null | undefined, w = 10): Seg[] => {
  if (v == null) return [{ t: '▱'.repeat(w), c: TRACK }, { t: ' ' }, { t: '–', c: DIM }]
  const f = Math.max(0, Math.min(w, Math.round((v / 100) * w)))
  const hot = v >= 85 ? HOT : ORANGE

  return [{ t: '▰'.repeat(f), c: hot }, { t: '▱'.repeat(w - f), c: TRACK }, { t: ' ' }, { t: Math.round(v) + '%', c: hot }]
}
const stag = (t: string): Seg => ({ t, c: LABEL, b: true })
const otag = (t: string): Seg => ({ t, c: ORANGE })

// "claude-sonnet-5-5" -> "SONNET 5.5"
const modelName = (id: string) => {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id)

  return m ? (m[1] + ' ' + m[2] + (m[3] ? '.' + m[3] : '')).toUpperCase() : id.toUpperCase()
}

let statusCleared = false
let branchName = ''
// The effort level the last tool hook reported (it follows /effort during the session).
let liveEffort = ''
// Memory in use and in total, in bytes, on macOS, Linux or Windows; the way that worked first is kept.
let ramMode = ''
async function readRam($: any): Promise<{ used: number; total: number } | null> {
  const mac = async () => {
    const vm = await $.process.run(['vm_stat'])
    const mem = await $.process.run(['sysctl', '-n', 'hw.memsize'])
    if (vm.exitCode !== 0 || mem.exitCode !== 0) throw new Error('no mac')
    const page = Number(/page size of (\d+)/.exec(vm.stdout)?.[1] || 16384)
    const n = (k: string) => Number(new RegExp(k + ':\\s+(\\d+)').exec(vm.stdout)?.[1] || 0)

    return { used: (n('Pages active') + n('Pages wired down') + n('Pages occupied by compressor')) * page, total: Number(mem.stdout.trim()) }
  }
  const linux = async () => {
    const t = await $.fs.read('/proc/meminfo')
    const kb = (k: string) => Number(new RegExp('^' + k + ':\\s+(\\d+)', 'm').exec(t)?.[1] || 0) * 1024
    const total = kb('MemTotal')
    const avail = kb('MemAvailable') || kb('MemFree')
    if (!total) throw new Error('no linux')

    return { used: total - avail, total }
  }
  const windows = async () => {
    const r = await $.process.run(['powershell', '-NoProfile', '-Command', '$o = Get-CimInstance Win32_OperatingSystem; "$($o.TotalVisibleMemorySize) $($o.FreePhysicalMemory)"'])
    const [t, f] = r.stdout.trim().split(/\s+/).map(Number)
    if (r.exitCode !== 0 || !t) throw new Error('no windows')

    return { used: (t - f) * 1024, total: t * 1024 }
  }
  const modes: Record<string, () => Promise<{ used: number; total: number }>> = { mac, linux, windows }
  const order = ramMode ? [ramMode] : ['mac', 'linux', 'windows']
  for (const m of order) {
    try {
      const r = await modes[m]()
      ramMode = m

      return r
    } catch {}
  }

  return null
}

async function updateStatus($: any) {
  try {
    // An older version pinned its line with $.ui.status (the yellow notice); clear what it left.
    if (!statusCleared) {
      statusCleared = true
      $.ui.status(undefined)
    }
    if (!cfg.stats) return
    const now = await $.clock.now()
    if (now - statusAt < 3000) return
    statusAt = now
    const root = await statusDir($)
    const u = await $.session.usage()
    let model = '?'
    let modelId = ''
    try {
      modelId = await $.session.model()
      model = modelName(modelId)
    } catch {}
    // The live level when a hook has seen one; else the settings: per model, then the top level.
    let effort = liveEffort
    if (!effort) {
      try {
        const cfg = JSON.parse(await $.fs.read(await homeSettings($)))
        effort = String(cfg.modelSettings?.[modelId]?.effortLevel ?? cfg.effortLevel ?? '')
      } catch {}
    }

    if (now - ramAt > 10000) {
      ramAt = now
      const r = await readRam($)
      if (r) {
        ramPct = (r.used / r.total) * 100
        ramTxt = `${(r.used / 2 ** 30).toFixed(1)} / ${Math.round(r.total / 2 ** 30)} GB`
      }
    }

    const run = async (argv: string[]) => {
      try {
        const r = await $.process.run(argv, { cwd: root })

        return r.exitCode === 0 ? r.stdout.trim() : ''
      } catch {
        return ''
      }
    }
    const top = await run(['git', '--no-optional-locks', 'rev-parse', '--show-toplevel'])
    const branch = (await run(['git', '--no-optional-locks', 'branch', '--show-current'])) || (await run(['git', '--no-optional-locks', 'rev-parse', '--short', 'HEAD']))
    if (branch !== branchName) {
      branchName = branch
      await update($, tick, n => n + 1)
    }
    const base = (top || root).split('/').pop() || root
    const kind = top ? 'PROJEKAT' : 'FOLDER'
    const name = base.toUpperCase()
    let git: Seg[] = []
    if (top) {
      let add = 0
      let del = 0
      for (const l of (await run(['git', '--no-optional-locks', 'diff', 'HEAD', '--numstat'])).split('\n').filter(Boolean)) {
        const [x, y] = l.split('\t')
        add += Number(x) || 0
        del += Number(y) || 0
      }
      const untracked = (await run(['git', '--no-optional-locks', 'ls-files', '--others', '--exclude-standard'])).split('\n').filter(Boolean)
      for (const f of untracked.slice(0, 200)) {
        try {
          add += (await $.fs.read(top + '/' + f)).split('\n').length - 1
        } catch {}
      }
      git = [{ t: ' ' }, { t: '·', c: DIM }, { t: ' ' }, otag('IZMJENE'), { t: ' ' }, { t: '+' + add, c: add ? GREEN : DIM }, { t: ' ' }, { t: '−' + del, c: del ? HOT : DIM }]
    }
    const place: Seg[] = [otag(kind), { t: ' ' }, { t: name, c: WHITE, k: 'name' }, { t: ' ' }, { t: '·', c: DIM }, { t: ' ' }, otag('GRANA'), { t: ' ' }, { t: branch ? branch.toUpperCase() : '–', c: WHITE, k: 'branch' }, ...git]

    const left = (iso?: string): Seg[] => {
      if (!iso) return []
      const ms = Date.parse(iso) - now
      if (!(ms > 0)) return []
      const m = Math.round(ms / 60000)
      const dd = Math.floor(m / 1440)
      const h = Math.floor((m % 1440) / 60)
      const mi = m % 60
      const txt = dd ? `${dd}D ${h}H` : h ? `${h}H ${mi}MIN` : `${mi}MIN`

      return [{ t: '  ' }, { t: '↻ ' + txt, c: DIM }]
    }
    const usage = (label: string, kindName: string): Seg[] => {
      const r = (u.rateLimits ?? []).find((x: any) => x.kind === kindName)

      return [stag(label), { t: ' ' }, ...sbar(r?.percentUsed), ...left(r?.resetsAt)]
    }

    const segs: Seg[] = [
      { t: '✻', c: ORANGE },
      { t: ' ' },
      { t: model, c: '#ffffff', b: true },
      ...(effort ? [{ t: ' ' }, { t: '·', c: DIM }, { t: ' ' }, { t: effort.toUpperCase(), c: ORANGE }] : []),
      ...sep(),
      ...place,
      ...sep(),
      stag('KONTEKST'), { t: ' ' }, ...sbar(u.context?.percent),
      ...sep(),
      ...usage('5H', 'five_hour'),
      ...sep(),
      ...usage('7D', 'seven_day'),
      ...sep(),
      stag('RAM'), { t: ' ' }, ...sbar(ramPct), ...(ramTxt ? [{ t: '  ' }, { t: ramTxt, c: DIM }] : []),
    ]
    if (JSON.stringify(segs) !== JSON.stringify(statusSegs)) {
      statusSegs = segs
      await update($, stick, n => n + 1)
    }
  } catch {}
}

// ~/.claude/settings.json, found from the session's home folder.
let settingsPath = ''
async function homeSettings($: any): Promise<string> {
  if (settingsPath) return settingsPath
  let home = ''
  try {
    const r = await $.process.run(['sh', '-c', 'printf %s "$HOME"'])
    if (r.exitCode === 0) home = r.stdout.trim()
  } catch {}
  if (!home) {
    try {
      const r = await $.process.run(['cmd', '/c', 'echo %USERPROFILE%'])
      home = r.stdout.trim().replace(/\\/g, '/')
    } catch {}
  }
  settingsPath = home + '/.claude/settings.json'

  return settingsPath
}

// Instant updates: a long-lived node process reports every file change under the project (fs.watch, recursive),
// and each report refreshes the panel and the status line at once. The one-second timer stays as a safety net
// (no node on the PATH, a watcher that died). Build output and caches are skipped; of .git only HEAD and refs
// count (a commit or a branch switch), never the index, which a plain `git status` rewrites.
const WATCH_JS = [
  "const fs=require('fs');const root=process.argv[1];",
  "const skip=/(^|\\/)(node_modules|\\.gradle|build|dist|\\.next|\\.DS_Store|__pycache__|\\.venv|target|\\.angular|\\.idea|\\.cache|coverage)(\\/|$)/;",
  "let t=null;const pend=new Set();",
  "fs.watch(root,{recursive:true},(ev,f)=>{if(!f)return;f=String(f);",
  "if(f==='.git'||f.startsWith('.git/')){if(!(f==='.git/HEAD'||f.startsWith('.git/refs')))return}else if(skip.test(f))return;",
  "pend.add(f);if(!t)t=setTimeout(()=>{const a=[...pend].slice(0,200);pend.clear();t=null;process.stdout.write(a.join('\\n')+'\\n')},15)});",
  "process.stdin.resume();",
].join('')
let watching = false
let fsBusy = false
let fsAgain = false
const fsQueue = new Set<string>()
async function onFsChange($: any, root: string, rels: string[]) {
  for (const r of rels) fsQueue.add(r)
  if (fsBusy) {
    fsAgain = true

    return
  }
  fsBusy = true
  // While Claude works, a file changed by a shell command (a script, sed, git) is shown too, as one written by Edit is.
  if (busy) {
    try {
      const cur = await read($, file)
      const fresh: string[] = []
      for (const r of rels.slice(0, 50)) {
        if (r === '.git' || r.startsWith('.git/')) continue
        const p = root + '/' + r
        if (p === cur) continue
        const st = await $.fs.stat(p)
        if (st.kind !== 'file' || st.size > MAX_EDIT || ownWrite.get(p) === st.mtimeMs) continue
        fresh.push(p)
      }
      if (fresh.length) await markEdited($, fresh.slice(-5), true, true)
    } catch {}
  }
  try {
    do {
      fsAgain = false
      fsQueue.clear()
      statusAt = 0
      gitAt = 0
      await refresh($, false)
    } while (fsAgain)
  } finally {
    fsBusy = false
  }
}
async function startWatcher($: any) {
  if (watching) return
  watching = true
  try {
    if (!(await isProject($))) {
      watching = false

      return
    }
    const root = await rootDir($)
    const proc = $.process.spawn({ argv: ['node', '-e', WATCH_JS, root], cwd: root })
    void (async () => {
      let buf = ''
      try {
        for await (const chunk of proc) {
          if (typeof chunk?.text !== 'string' || chunk.stream !== 'stdout') continue
          buf += chunk.text
          const cut = buf.lastIndexOf('\n')
          if (cut < 0) continue
          const rels = buf.slice(0, cut).split('\n').filter(Boolean)
          buf = buf.slice(cut + 1)
          if (rels.length) await onFsChange($, root, rels)
        }
      } catch {}
      watching = false
    })()
  } catch {
    watching = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await rootDir($)
    await loadConfig($)
    try {
      await $.command.register({ name: 'code-kit', description: 'Uključi panel (struktura projekta i editor)' })
    } catch {}
    await openPanels($)
    void startWatcher($)
    // Safety net, once a second: the open file is reread, and during a turn the tree is scanned for changes.
    $.clock.every(1000, () => {
      void (async () => {
        try {
          await refresh($, true)
        } catch {}
      })()
    })
    // The surface may not be attached yet at start: retry until the pane is drawn.
    void (async () => {
      for (let i = 0; i < 20; i++) {
        await $.clock.sleep(500)
        try {
          if (!cfg.panel || !(await isProject($))) return
          const p = (await $.ui.panes()) as any
          const list = Array.isArray(p) ? p : p?.panes ?? []
          if (list.some((x: any) => x.id === PANE && x.isPlaced)) return
          await openPanels($)
        } catch {}
      }
    })()

    return next(e)
  })

  // /code-kit: bring the panel up (the saved choice from /code-kit:config is not changed).
  on('command.run', { command: 'code-kit' }, async $ => {
    if (!(await isProject($))) {
      return {
        text: `Panel se ne otvara: ${await rootDir($)} nije projekat. Panel radi samo u folderu projekta, a ovdje nema nijednog od: ${MARKERS.join(', ')}. Pokreni Claude Code u folderu projekta (na primjer u onom sa .git).`,
      }
    }
    await openPanels($, true, true)

    return { text: 'Panel je uključen.' }
  })

  // The panel is fixed: the person's close mark or key is refused. The plugin's own close (not a project) goes through.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin?.kind === 'person') return {}

    return next(e)
  })

  // Claude's shell moved to another folder: the status line follows (the panel does not).
  on('classic.CwdChanged', async ($, e, next) => {
    try {
      await focusOn($, (e as any).new_cwd, false)
    } catch {}

    return next(e)
  })

  // The panel redraws as the status line does: after each tool and at the end of a turn.
  // A failure here must never hold up the event, so it is swallowed and next(e) always runs.
  on('turn.start', async ($, e, next) => {
    busy = true
    statusAt = 0
    gitAt = 0
    void updateStatus($)
    try {
      turnStart = await $.clock.now()
    } catch {}

    return next(e)
  })

  // A file written through Edit/Write is marked and shown in the editor the moment the tool is done.
  on('classic.PostToolUse', async ($, e, next) => {
    try {
      const lvl = (e as any).effort?.level
      if (typeof lvl === 'string' && lvl) liveEffort = lvl
    } catch {}
    try {
      const inp = ((e as any).tool_input ?? (e as any).input ?? {}) as { file_path?: unknown; notebook_path?: unknown }
      const fp = inp.file_path ?? inp.notebook_path
      const wrote = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(String((e as any).tool_name ?? (e as any).tool ?? ''))
      // The editor shows only files Claude edits (not ones it merely reads) that belong to the folder Claude was started in.
      if (typeof fp === 'string' && fp.startsWith('/')) {
        const inside = fp.startsWith((await rootDir($)) + '/')
        await markEdited($, [fp], wrote && inside, wrote && inside)
      }
      // The status line follows what the tool touched: a file or folder inside a repository.
      const touched = fp ?? (inp as { path?: unknown }).path
      if (typeof touched === 'string' && touched.startsWith('/')) {
        const dir = /\.[A-Za-z0-9]+$/.test(touched) || fp ? touched.slice(0, touched.lastIndexOf('/')) : touched
        await focusOn($, dir || '/', true)
      }
    } catch {}
    try {
      statusAt = 0
      gitAt = 0
      await refresh($, false, true)
    } catch {}

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    try {
      statusAt = 0
      gitAt = 0
      await refresh($, false, true)
    } catch {}
    busy = false

    return next(e)
  })

  // The editor posts its whole text on every edit; this is the autosave.
  // The editor posts its whole text on every edit (the autosave) and the text it copies.
  on('ui.message', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const d = e.data as { path?: unknown; text?: unknown; copy?: unknown; top?: unknown; left?: unknown; shift?: unknown }
    if (typeof d?.top === 'number') editTop = d.top
    if (typeof d?.left === 'number') editLeft = d.left
    if (typeof d?.shift === 'boolean') shiftHeld = d.shift
    if (typeof d?.path === 'string' && typeof d?.text === 'string') {
      if (knownPath !== d.path) {
        try {
          known = await $.fs.read(d.path)
        } catch {
          known = d.text
        }
        knownPath = d.path
            }
      known = d.text
      lastEditAt = Date.now()
      // The draft follows the keys, so a later rev bump (git marks, reload) never hands the editor stale text.
      await update($, draft, () => d.text as string)
      // Writes go one at a time and only the newest text is written: no out-of-order saves.
      pendingWrite = { path: d.path, text: d.text }
      if (!flushing) {
        flushing = true
        try {
          while (pendingWrite) {
            const w = pendingWrite
            pendingWrite = null
            try {
              await $.fs.write(w.path, w.text)
              const st = await $.fs.stat(w.path)
              ownWrite.set(w.path, st.mtimeMs)
            } catch {}
          }
        } finally {
          flushing = false
          lastEditAt = Date.now()
        }
      }
    }
    if (d?.paste === true) {
      const clip = await readClipboard($)
      const say = async (msg: string) => {
        const mine = ++copyToken
        await update($, copied, () => msg)
        try {
          await $.clock.sleep(2000)
          if (mine === copyToken) await update($, copied, () => '')
        } catch {}
      }
      if (clip === null) void say('Ne mogu da pročitam međuspremnik')
      else if (!clip) void say('Međuspremnik je prazan')
      else if (clip.length > MAX_PASTE) void say(`Predugačko za lijepljenje (${clip.length} znakova, najviše ${MAX_PASTE})`)
      else {
        const mine = Date.now()
        pasteBox = { id: mine, text: clip }
        await update($, tick, n => n + 1)
        void (async () => {
          try {
            await $.clock.sleep(2000)
            if (pasteBox && pasteBox.id === mine) {
              pasteBox = null
              await update($, tick, n => n + 1)
            }
          } catch {}
        })()
      }
    }
    if (typeof d?.copy === 'string') {
      await $.ui.copy({ text: d.copy, surface: e.surface })
      // A notice in the editor's header for two seconds; a newer copy keeps it up longer.
      const mine = ++copyToken
      const n = d.copy.length
      await update($, copied, () => `✓ Kopirano (${n} ${n === 1 ? 'znak' : 'znakova'})`)
      void (async () => {
        try {
          await $.clock.sleep(2000)
          if (mine === copyToken) await update($, copied, () => '')
        } catch {}
      })()
    }

    return next(e)
  })

  // The pane never scrolls as a whole: the wheel moves the tree's own window.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // The wheel over the left half scrolls the editor (its Client reads the running total).
    if (e.pointer && e.pointer.column <= (editColsLive || (await read($, editCols)))) {
      // After a reload the module's own copy is empty until the next open: fall back to the drawn text.
      await ensureKnown($)
      const onBar = e.pointer.row === barRow
      if (onBar && known) {
        const longest = known.split('\n').reduce((n, l) => Math.max(n, l.length), 0)
        const sideways = Math.max(0, Math.min(Math.max(0, longest - editCols2 + 1), editLeft + e.by * WHEEL_STEP))
        if (sideways !== editLeft) {
          editLeft = sideways
          await update($, hwheel, n => n + 1)
        }

        return {}
      }
      const max = Math.max(0, known.split('\n').length - editRows)
      const next = Math.max(0, Math.min(max, editTop + e.by * WHEEL_STEP))
      if (next !== editTop) {
        editTop = next
        await update($, wheel, n => n + 1)
      }

      return {}
    }
    // Over the changed-files list the wheel moves that list on its own.
    if (e.pointer && chgFrom >= 0 && e.pointer.row >= chgFrom) {
      const cmax = Math.max(0, chgCount - chgHeight)
      await update($, chgOff, n => Math.max(0, Math.min(cmax, Math.min(n, cmax) + e.by)))

      return {}
    }
    // Live numbers from the last draw first (the atom is only a fallback after a reload), and the
    // offset is clamped before the move, so a stale offset past the end leaves no dead zone.
    const max = wheelRows ? Math.max(0, wheelRows - treeHeight) : await read($, treeMax)
    await update($, treeOff, n => Math.max(0, Math.min(max, Math.min(n, max) + e.by)))

    return {}
  })

  // The status line: drawn in the hint line under the prompt, with Text colours like the one in settings.json.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    await read($, stick)
    if (!cfg.stats) return next(e)
    if (!statusSegs.length) void updateStatus($)

    // Too long for the row: the project name and the branch give way, ending in an ellipsis, so nothing else is cut.
    const cols = (e as any).viewport?.columns ?? 120
    const segs = statusSegs.map(g => ({ ...g }))
    let over = segs.reduce((n, g) => n + g.t.length, 0) - (cols + 2)
    for (const k of ['branch', 'name'] as const) {
      const g = segs.find(x => x.k === k)
      if (!g || over <= 0) continue
      const keep = Math.max(15, g.t.length - over)
      if (keep < g.t.length) {
        over -= g.t.length - keep
        g.t = g.t.slice(0, keep - 1) + '…'
      }
    }

    return (
      <Box flexDirection="row">
        <Text>
          {segs.map((g, i) => (
            <Text key={i} color={g.c} bold={g.b}>{g.t}</Text>
          ))}
        </Text>
      </Box>
    )
  })


  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Client, Input } = $.ui.resolve(e)
    await read($, tick)
    const rawQuery = await read($, query)
    const q = rawQuery.trim().toLowerCase()
    const root = await rootDir($)
    const expanded = new Set(await read($, open))
    const active = await read($, file)
    const text = await read($, draft)
    const revision = await read($, rev)
    const notice = await read($, copied)
    const rows: Row[] = []
    const key = root + '\0' + (await read($, tick)) + '\0' + [...expanded].join('\0')

    const walk = async (dir: string, depth: number) => {
      let entries
      try {
        entries = await $.fs.list(dir)
      } catch {
        return
      }
      entries.sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
      )
      for (const it of entries) {
        if (rows.length >= MAX_ROWS) return
        if (SKIP.has(it.name)) continue
        const p = `${dir}/${it.name}`
        const isDir = it.kind === 'dir'
        rows.push({ path: p, name: it.name, depth, isDir })
        if (isDir && expanded.has(p)) await walk(p, depth + 1)
      }
    }
    if (q) {
      // Search: every folder is read (cached until a file changes), then only the matches and the folders leading to them stay.
      const ikey = root + '\0' + (await read($, tick))
      if (ikey !== indexKey) {
        const all: Row[] = []
        const crawl = async (dir: string, depth: number) => {
          let entries
          try {
            entries = await $.fs.list(dir)
          } catch {
            return
          }
          entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
          for (const it of entries) {
            if (all.length >= MAX_INDEX) return
            if (SKIP.has(it.name)) continue
            const p = `${dir}/${it.name}`
            const isDir = it.kind === 'dir'
            all.push({ path: p, name: it.name, depth, isDir })
            if (isDir) await crawl(p, depth + 1)
          }
        }
        await crawl(root, 0)
        indexRows = all
        indexKey = ikey
      }
      // A flat list: only what matches, each by its own name, no path and no indent.
      for (const r of indexRows) if (r.name.toLowerCase().includes(q)) rows.push({ ...r, depth: 0 })
    } else if (key === treeKey) rows.push(...treeRows)
    else {
      await walk(root, 0)
      treeKey = key
      treeRows = rows.slice()
    }

    const toggle = (p: string) =>
      update($, open, list => (list.includes(p) ? list.filter(x => x !== p) : [...list, p]))
    // Something picked from the search results (folder or file): the search clears and the tree opens up to it.
    const reveal = (p: string, isFile = false) => {
      const chain: string[] = isFile ? [] : [p]
      let d = p.slice(0, p.lastIndexOf('/'))
      while (d.length > root.length) {
        chain.push(d)
        d = d.slice(0, d.lastIndexOf('/'))
      }
      void update($, open, list => [...list, ...chain.filter(x => !list.includes(x))])
      void update($, query, () => '')
      void update($, treeOff, () => 0)
    }
    // Everything fits the window the engine gave the body, so nothing scrolls the pane.
    const H = Math.max(8, e.props.scroll?.bodyRows ?? (e.viewport?.rows ?? 30) - 8)
    const HEAD = 3
    const height = H - HEAD
    const off = await read($, treeOff)
    const name = root.split('/').pop() || root

    const ORANGE = '#d97757'
    const total = Math.max(40, (e.props.bodyColumns ?? 80) - 2)
    const treeW = Math.max(20, Math.min(34, Math.floor(total * 0.38)))
    const editW = Math.max(20, total - treeW - 3)
    const fit = (t: string, used: number) =>
      t.length + used > treeW - 2 ? t.slice(0, Math.max(1, treeW - 2 - used - 1)) + '…' : t
    const GRAY = '#6b7280'
    const ACTIVE_BG = '#2f3340'
    const NEW_BG = '#1f3a2a' // new: green
    const MOD_BG = '#1f3050' // changed: blue
    const bgOf = (p: string, isDir: boolean) =>
      (isDir ? gitNewDirs.has(p) && !gitTrackedDirs.has(p) : gitNew.has(p)) ? NEW_BG
      : (isDir ? gitNewDirs.has(p) || gitModDirs.has(p) : gitMod.has(p)) ? MOD_BG
      : undefined
    const split = (n: string) => {
      const i = n.lastIndexOf('.')

      return i > 0 ? [n.slice(0, i), n.slice(i)] : [n, '']
    }
    // The tree's column: name, count, rule, search; the tree; then (only while git sees changes) a rule with a label
    // and the changed files, a third of the height at most. The editor's column keeps its full height.
    const changes: { path: string; name: string; kind: 'N' | 'M' | 'D' }[] = []
    for (const p of gitNew) changes.push({ path: p, name: p.slice(p.lastIndexOf('/') + 1), kind: 'N' })
    for (const p of gitMod) changes.push({ path: p, name: p.slice(p.lastIndexOf('/') + 1), kind: 'M' })
    for (const p of gitDel) changes.push({ path: p, name: p.slice(p.lastIndexOf('/') + 1), kind: 'D' })
    changes.sort((a, b) => a.path.localeCompare(b.path))
    const shownChanges = (q ? changes.filter(c => c.name.toLowerCase().includes(q)) : changes).slice(0, 500)
    const cheight = changes.length ? Math.min(changes.length, Math.max(3, Math.floor((H - 6) / 3))) : 0
    const theight = Math.max(1, height - 1 - (cheight ? cheight + 1 : 0))
    chgHeight = cheight
    chgCount = shownChanges.length
    chgFrom = cheight ? HEAD + 1 + theight : -1
    const cmaxOff = Math.max(0, shownChanges.length - cheight)
    const cstart = Math.min(await read($, chgOff), cmaxOff)
    const maxOff = Math.max(0, rows.length - theight)
    treeHeight = theight
    wheelRows = rows.length
    editColsLive = editW + 1
    void update($, treeMax, () => maxOff)
    void update($, editCols, () => editW + 1)
    const wheelTotal = await read($, wheel)
    const sidewaysTotal = await read($, hwheel)
    editRows = Math.max(1, height - 1)
    barRow = HEAD + height - 1
    editCols2 = Math.max(8, editW - String(known.split('\n').length).length - 4)
    const isBig = text.length > MAX_EDIT
    // A Client's props may not pass 100000 characters serialized or it unmounts (and the pane goes blank). The text comes
    // first, then the line marks, the paste and last the committed copy (for the revert button): what does not fit is left out.
    const PROPS_BUDGET = 90000
    const shownText = isBig ? text.slice(0, MAX_EDIT) : text
    let room = PROPS_BUDGET - shownText.length - 1500
    const marksStr = isBig ? '' : JSON.stringify(gitLines)
    const marksFit = !isBig && marksStr.length <= room
    const shownMarks = marksFit ? { ...gitLines } : {}
    room -= marksFit ? marksStr.length : 0
    const shownPaste = !isBig && pasteBox && pasteBox.text.length <= room ? pasteBox : null
    room -= shownPaste ? shownPaste.text.length : 0
    const baseStr = !isBig && gitBase ? JSON.stringify(gitBase) : ''
    const shownBase = !isBig && gitBase && baseStr.length <= room ? gitBase : null
    const start = Math.min(off, maxOff)
    const shown = rows.slice(start, start + theight)
    const dirs = rows.filter(r => r.isDir).length
    const activeName = active.split('/').pop() ?? ''
    const rel = active.startsWith(root + '/') ? active.slice(root.length + 1) : active

    return (
      <Box flexDirection="column">
      <Box flexDirection="row" paddingX={1}>
        <Box flexDirection="column" width={editW}>
          <Text bold color={ORANGE}>{active ? activeName : 'EDITOR'}</Text>
          {notice ? <Text color="#9ece6a" bold>{notice}</Text> : <Text dimColor>{active ? (isBig ? 'samo pregled (fajl prevelik) · ' : '') + fit(rel, 0) : 'Izaberi fajl iz strukture'}</Text>}
          <Text dimColor>{'─'.repeat(editW)}</Text>
          {active && (
            <Client
              key="editor"
              module="./editor.tsx"
              props={{ path: active, text: shownText, wheel: wheelTotal, scrollTo: editTop, hwheel: sidewaysTotal, scrollLeft: editLeft, marks: shownMarks, base: shownBase, paste: shownPaste, readOnly: isBig, rev: revision }}
              width={editW}
              height={height}
            />
          )}
        </Box>
        <Box flexDirection="column" width={3} alignItems="center">
          {Array.from({ length: H }, (_, i) => (
            <Text key={'sep' + i} dimColor>│</Text>
          ))}
        </Box>
        <Box flexDirection="column" width={treeW}>
          <Text>
            <Text bold color={ORANGE}>{fit(name.toUpperCase(), 0)}</Text>
            {branchName && treeW - Math.min(name.length, treeW - 3) - 3 >= 4 ? (
              <Text color={GRAY}>{' · '}<Text color="#e6e6e6">{(() => {
                const room = treeW - Math.min(name.length, treeW - 3) - 3
                const b = branchName.toUpperCase()

                return b.length > room ? b.slice(0, Math.max(1, room - 1)) + '…' : b
              })()}</Text></Text>
            ) : null}
          </Text>
          <Text color={GRAY}>
            {rows.length >= MAX_ROWS ? MAX_ROWS + '+' : rows.length} stavki · {dirs} foldera
            {maxOff > 0 ? ' · ' + (start + 1) + '–' + Math.min(rows.length, start + theight) : ''}
          </Text>
          <Text color={GRAY}>{'─'.repeat(treeW)}</Text>
          <Input
            key="search"
            label="⌕ "
            placeholder="Traži fajl ili folder"
            value={rawQuery}
            onInput={(v: string) => {
              void update($, query, () => v)
              void update($, treeOff, () => 0)
              void update($, chgOff, () => 0)
            }}
            onSubmit={(v: string) => {
              // Enter: an exact name picks that file (or folder); anything else just clears the search.
              const t = v.trim().toLowerCase()
              const hit = t ? rows.find(r => !r.isDir && r.name.toLowerCase() === t) ?? rows.find(r => r.isDir && r.name.toLowerCase() === t) : undefined
              if (hit) {
                reveal(hit.path, !hit.isDir)
                if (!hit.isDir) void openFile($, hit.path)
              } else {
                void update($, query, () => '')
                void update($, treeOff, () => 0)
                void update($, chgOff, () => 0)
              }
            }}
          />
          {q && !shown.length ? <Text color={GRAY}>Nema rezultata.</Text> : null}
          {shown.map(r => {
            const guide = '│ '.repeat(r.depth)
            const room = treeW - 2 - r.depth * 2 - 2
            if (r.isDir) {
              const isOpen = q ? false : expanded.has(r.path)
              const label = r.name.length > room ? r.name.slice(0, Math.max(1, room - 1)) + '…' : r.name

              const dbg = bgOf(r.path, true)
              const dpad = dbg ? ' '.repeat(Math.max(0, room - label.length)) : ''

              return (
                <Button key={r.path} plain onPress={() => (q ? reveal(r.path) : toggle(r.path))}>
                  <Text color="#3b4048">{guide}</Text>
                  <Text color={ORANGE} backgroundColor={dbg}>{isOpen ? '▾ ' : '▸ '}</Text>
                  <Text bold color={isOpen ? '#e6e6e6' : '#c0c5ce'} backgroundColor={dbg}>{label}{dpad}</Text>
                </Button>
              )
            }
            const isActive = r.path === active
            const [base, ext] = split(r.name)
            const color = isActive ? '#ffffff' : '#c0c5ce'
            const dot = r.name.startsWith('.')
            const [ico, icoColor] = iconOf(r.name)
            const froom = room - 1
            const full = r.name.length > froom ? r.name.slice(0, Math.max(1, froom - 1)) + '…' : r.name
            const baseShown = full.length < r.name.length ? full : base
            const extShown = full.length < r.name.length ? '' : ext
            const tinted = bgOf(r.path, false)
            const pad = isActive || tinted ? ' '.repeat(Math.max(0, froom - full.length)) : ''
            const bg = isActive ? ACTIVE_BG : tinted

            return (
              <Button key={r.path} plain onPress={() => { if (q) reveal(r.path, true); return openFile($, r.path) }}>
                <Text color="#3b4048">{guide}</Text>
                <Text color={ORANGE} backgroundColor={bg}>{isActive ? '▎' : ' '}</Text>
                <Text color={icoColor} backgroundColor={bg}>{ico + ' '}</Text>
                <Text bold={isActive} color={dot ? GRAY : color} backgroundColor={bg}>{baseShown}</Text>
                <Text color={isActive ? '#aab1c0' : GRAY} backgroundColor={bg}>{extShown}{pad}</Text>
              </Button>
            )
          })}
          {cheight ? (
            <Text>
              <Text color={GRAY}>{'─ '}</Text>
              <Text bold color={ORANGE}>{'IZMJENE'}</Text>
              <Text color={GRAY}>{' · ' + shownChanges.length + (cmaxOff > 0 ? ' · ' + (cstart + 1) + '–' + Math.min(shownChanges.length, cstart + cheight) : '') + ' '}</Text>
              <Text color={GRAY}>{'─'.repeat(Math.max(0, treeW - 14 - String(shownChanges.length).length - (cmaxOff > 0 ? 8 : 0)))}</Text>
            </Text>
          ) : null}
          {cheight && q && !shownChanges.length ? <Text color={GRAY}>Nema rezultata.</Text> : null}
          {cheight ? shownChanges.slice(cstart, cstart + cheight).map(c => {
            const [ico, icoColor] = iconOf(c.name)
            const st = gitStat.get(c.path)
            const counts = st ? ` +${st[0]} −${st[1]}` : ''
            const avail = Math.max(4, treeW - 2 - 3 - counts.length)
            const nm = c.name.length > avail ? c.name.slice(0, Math.max(1, avail - 1)) + '…' : c.name
            const relDir = c.path.startsWith(root + '/') ? c.path.slice(root.length + 1, c.path.lastIndexOf('/')) : ''
            const left = avail - nm.length - 2
            const dirShown = relDir && left >= 4 ? (relDir.length > left ? '…' + relDir.slice(relDir.length - left + 1) : relDir) : ''
            const pad = ' '.repeat(Math.max(0, avail - nm.length - (dirShown ? dirShown.length + 2 : 0)))
            const isAct = c.path === active
            const bg = isAct ? ACTIVE_BG : undefined
            const kc = c.kind === 'N' ? '#7fbf8f' : c.kind === 'D' ? '#f7768e' : '#6cb6ff'
            const body = (
              <Text>
                <Text bold color={kc} backgroundColor={bg}>{c.kind}</Text>
                <Text color={c.kind === 'D' ? GRAY : icoColor} backgroundColor={bg}>{ico + ' '}</Text>
                <Text bold={isAct} color={c.kind === 'D' ? GRAY : isAct ? '#ffffff' : '#c0c5ce'} backgroundColor={bg}>{nm}</Text>
                <Text color={GRAY} backgroundColor={bg}>{dirShown ? '  ' + dirShown : ''}{pad}</Text>
                {st ? <Text backgroundColor={bg}><Text color="#7fbf8f">{' +' + st[0]}</Text><Text color="#f7768e">{' −' + st[1]}</Text></Text> : null}
              </Text>
            )

            // A deleted file has nothing to open: shown dim, not pressable.
            return c.kind === 'D' ? <Box key={'c' + c.path}>{body}</Box> : (
              <Button key={'c' + c.path} plain onPress={() => { if (q) reveal(c.path, true); return openFile($, c.path) }}>{body}</Button>
            )
          }) : null}
        </Box>
      </Box>
      {/* One row past the window: a body that fits shows nothing to scroll, and the engine then sends no wheel at all. */}
      <Text> </Text>
      </Box>
    )
  })
}
