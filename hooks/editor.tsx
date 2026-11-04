// Surface module of the editor pane: a small code editor drawn with Text runs,
// so lines can carry a gutter and syntax colours (an Input can carry neither).
// Edits post the whole text to the hooks module, which writes it to disk.

const CONTROL = new Set('if else for while do switch case break continue return try catch finally throw await yield import export from default'.split(' '))
const KEYWORD = new Set(
  'const let var function new class extends async typeof instanceof in of void static public private protected final abstract interface enum implements package def lambda pass with as raise None True False null true false undefined this self super int long double float boolean string char byte short fun val override object when is type namespace readonly'.split(' '),
)
const HASH = new Set(['py', 'sh', 'bash', 'zsh', 'yml', 'yaml', 'toml', 'rb', 'env', 'properties', 'conf', 'mk', 'gitignore'])

const C = {
  text: '#d4d4d4',
  gutter: '#5c6370',
  gutterOn: '#9da5b4',
  comment: '#6a9955',
  string: '#ce9178',
  number: '#b5cea8',
  keyword: '#569cd6',
  control: '#c586c0',
  func: '#dcdcaa',
  type: '#4ec9b0',
  key: '#9cdcfe',
}

type Tok = { s: string; c: string }

const tokenize = (line: string, ext: string, inBlock: boolean): { toks: Tok[]; inBlock: boolean } => {
  const toks: Tok[] = []
  const push = (s: string, c: string) => {
    const last = toks[toks.length - 1]
    if (last && last.c === c) last.s += s
    else toks.push({ s, c })
  }
  const hash = HASH.has(ext)
  const isJson = ext === 'json'
  let i = 0
  while (i < line.length) {
    if (inBlock) {
      const end = line.indexOf('*/', i)
      if (end < 0) {
        push(line.slice(i), C.comment)
        i = line.length
      } else {
        push(line.slice(i, end + 2), C.comment)
        i = end + 2
        inBlock = false
      }
      continue
    }
    const ch = line[i]
    const nx = line[i + 1]
    if (!hash && ch === '/' && nx === '*') {
      inBlock = true
      push('/*', C.comment)
      i += 2
      continue
    }
    if ((!hash && ch === '/' && nx === '/') || (hash && ch === '#') || (ext === 'sql' && ch === '-' && nx === '-')) {
      push(line.slice(i), C.comment)
      break
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      while (j < line.length && line[j] !== ch) j += line[j] === '\\' ? 2 : 1
      const str = line.slice(i, j + 1)
      const isKey = (isJson || ext === 'yml' || ext === 'yaml') && /^\s*:/.test(line.slice(j + 1))
      push(str, isKey ? C.key : C.string)
      i = j + 1
      continue
    }
    if (/[0-9]/.test(ch)) {
      const m = /^\d[\d._xa-fA-F]*/.exec(line.slice(i)) as RegExpExecArray
      push(m[0], C.number)
      i += m[0].length
      continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(line.slice(i)) as RegExpExecArray
      const w = m[0]
      const after = line.slice(i + w.length)
      const color = CONTROL.has(w) ? C.control
        : KEYWORD.has(w) ? C.keyword
        : /^\s*\(/.test(after) ? C.func
        : /^[A-Z]/.test(w) ? C.type
        : C.text
      push(w, color)
      i += w.length
      continue
    }
    push(ch, C.text)
    i += 1
  }
  return { toks, inBlock }
}

// '+' and '-' are lines changed in this session, by anyone (blue); 'g' is a line git sees as added (green).
type Marks = Record<number, '+' | '-' | 'g'>
const CLAUDE_BG = '#1c3556'
const CLAUDE_FG = '#6cb6ff'
const GIT_BG = '#1f3a2a'
const GIT_FG = '#7fbf8f'

// Where each line of `a` went in `b` (-1 when gone): common head and tail, then a longest
// common subsequence of the small part between. The hooks module keeps the same function.
const align = (a: string[], b: string[]): number[] => {
  const map = new Array<number>(a.length).fill(-1)
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  for (let i = 0; i < head; i++) map[i] = i
  for (let i = 0; i < tail; i++) map[a.length - 1 - i] = b.length - 1 - i
  const n = a.length - head - tail
  const m = b.length - head - tail
  if (n === 0 || m === 0 || n * m > 2_000_000) return map
  const w = m + 1
  const dp = new Int32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[head + i] === b[head + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[head + i] === b[head + j]) { map[head + i] = head + j; i++; j++ }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++
    else j++
  }

  return map
}

// The marks after the person's own edit: unchanged lines keep theirs and follow their lines. A line the person
// typed into is marked at once ('+' blue, or 'g' green when it was already new or is a freshly added line), so the
// colour does not wait for git and does not vanish while they keep typing.
const carry = (marks: Marks, a: string[], b: string[]): Marks => {
  const map = align(a, b)
  const next: Marks = {}
  const hit = new Set<number>()
  const gone: number[] = []
  for (let i = 0; i < a.length; i++) {
    const to = map[i]
    if (to !== undefined && to >= 0) {
      hit.add(to)
      const mk = marks[i]
      if (mk) next[to] = mk
    } else gone.push(i)
  }
  let n = 0
  for (let j = 0; j < b.length; j++) {
    if (hit.has(j)) continue
    const src = gone[n++]
    next[j] = src === undefined || marks[src] === 'g' ? 'g' : '+'
  }

  return next
}

// The text of a paste (Ctrl+V) put at the cursor, replacing a selection if there is one.
const applyInsert = (s: { lines: string[]; row: number; col: number; anchor: Pos | null }, text: string) => {
  const lines = s.lines.slice()
  let row = s.row
  let col = s.col
  const r = order(s)
  if (r) {
    const head = (lines[r[0].row] ?? '').slice(0, r[0].col)
    const tail = (lines[r[1].row] ?? '').slice(r[1].col)
    lines.splice(r[0].row, r[1].row - r[0].row + 1, head + tail)
    row = r[0].row
    col = r[0].col
  }
  const parts = text.replace(/\r\n?/g, '\n').split('\n')
  const l = lines[row] ?? ''
  const tail = l.slice(col)
  if (parts.length === 1) {
    lines[row] = l.slice(0, col) + parts[0] + tail
    col += (parts[0] as string).length
  } else {
    lines[row] = l.slice(0, col) + parts[0]
    lines.splice(row + 1, 0, ...parts.slice(1))
    row += parts.length - 1
    col = (parts[parts.length - 1] as string).length
    lines[row] += tail
  }

  return { lines, row, col }
}
// The newest paste already put in (a paste arrives as a prop and must go in once).
let lastPasteId = 0

// Puts one changed line back as git has it (HEAD): `base` is the committed text. A line typed over gets its old
// text (or goes, when it is new); a '-' mark gets the lines that were taken out above it.
const revertAt = (lines: string[], base: string[], r: number): { lines: string[]; fixed: number[] } | null => {
  const map = align(base, lines)
  const back = new Array<number>(lines.length).fill(-1)
  for (let i = 0; i < base.length; i++) { const to = map[i]; if (to !== undefined && to >= 0) back[to] = i }
  const next = lines.slice()
  if (back[r] === -1) {
    let s = r
    let e = r
    while (s > 0 && back[s - 1] === -1) s--
    while (e < lines.length - 1 && back[e + 1] === -1) e++
    const bp = s > 0 ? (back[s - 1] as number) : -1
    const bn = e < lines.length - 1 ? (back[e + 1] as number) : base.length
    const region = base.slice(bp + 1, bn)
    const off = r - s
    if (off < region.length) {
      next[r] = region[off] as string
      // The last line of a block that lost more lines than it kept brings back the rest, which have no button of their own.
      const extra = r === e ? region.slice(e - s + 1) : []
      if (extra.length) next.splice(r + 1, 0, ...extra)
      return { lines: next, fixed: [r, ...extra.map((_, i) => r + 1 + i)] }
    }
    next.splice(r, 1)
    if (!next.length) next.push('')
    return { lines: next, fixed: [] }
  }
  let p = r - 1
  while (p >= 0 && back[p] === -1) p--
  const bp = p >= 0 ? (back[p] as number) : -1
  const region = base.slice(bp + 1, back[r])
  if (!region.length) {
    // Lines taken out at the very end of the file: the mark sits on the last line, the lines go back below it.
    const tail = r === lines.length - 1 ? base.slice((back[r] as number) + 1) : []
    if (!tail.length) return null
    next.push(...tail)

    return { lines: next, fixed: tail.map((_, i) => r + 1 + i) }
  }
  next.splice(r, 0, ...region)

  return { lines: next, fixed: region.map((_, i) => r + i) }
}

type Pos = { row: number; col: number }
type Snap = { lines: string[]; row: number; col: number }
type State = {
  path: string
  rev: number
  lines: string[]
  row: number
  col: number
  top: number
  left: number
  wheel: number
  hwheel: number
  marks: Marks
  anchor: Pos | null
  undo: Snap[]
  hold?: boolean
}
type Props = { path: string; text: string; wheel?: number; scrollTo?: number; hwheel?: number; scrollLeft?: number; marks?: Marks; readOnly?: boolean; rev?: number; base?: string[] | null; focused?: boolean; paste?: { id: number; text: string } | null }

const NAMED = new Set(['up', 'down', 'left', 'right', 'return', 'tab', 'backspace', 'delete', 'pageup', 'pagedown', 'home', 'end', 'space', 'escape'])
const SEL_BG = '#264f78'
const HOT_BG = '#3b82c4'
// The row whose revert button the pointer is over (-1: none).
let hoverRow = -1

// The newest state, ahead of a redraw: key repeats and drag moves arrive faster than frames.
let live: State | null = null
let drag = false
let lastTop = 0
let lastLeft = 0
let shiftSeen = false
// The cursor blinks: shown while true. Any edit or move turns it back on, so it stays solid while typing.
let blinkOn = true
// The pane's isFocused stays false while a Client has the keys, so it cannot tell. The cursor is drawn for
// ACTIVE_MS after the last key or click in this file instead.
const ACTIVE_MS = 10000
let lastActive = 0
const stamp = () => { lastActive = typeof Date !== 'undefined' ? Date.now() : 0 }
const isActive = () => lastActive > 0 && (typeof Date === 'undefined' || Date.now() - lastActive < ACTIVE_MS)
const blinkers = new WeakSet<object>()
// Set just before a commit that must leave the sideways window where it is (a whole-line selection).
let holdNext = false
type Click = { row: number; col: number; t: number; count: number }
let lastClick: Click | null = null

const before = (a: Pos, b: Pos) => a.row < b.row || (a.row === b.row && a.col < b.col)
const order = (m: { row: number; col: number; anchor: Pos | null }): [Pos, Pos] | null => {
  if (!m.anchor) return null
  const cur = { row: m.row, col: m.col }
  if (m.anchor.row === cur.row && m.anchor.col === cur.col) return null
  return before(m.anchor, cur) ? [m.anchor, cur] : [cur, m.anchor]
}
const slice = (lines: string[], a: Pos, b: Pos) => {
  if (a.row === b.row) return lines[a.row].slice(a.col, b.col)
  return [lines[a.row].slice(a.col), ...lines.slice(a.row + 1, b.row), lines[b.row].slice(0, b.col)].join('\n')
}

// A Text refuses control characters and unpaired surrogates (the whole tree is then skipped:
// "returned a tree that does not validate"). A file may hold them (ESC in a log, NUL, form feed),
// so each is drawn as a visible placeholder; the file text itself is left untouched.
function safeChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return '·'
  if (code >= 0xd800 && code <= 0xdfff) return '�'
  return ch
}

export default function Editor(props: Props, surface: any) {
  const { Box, Text } = surface.elements
  // One blink timer per instance (started on the first call, ended with the instance).
  if (!blinkers.has(surface)) {
    blinkers.add(surface)
    surface.every(530, () => {
      blinkOn = !blinkOn
      if (live) surface.setState({ ...live })
    })
  }
  // The last row is the sideways-scroll bar; the text gets the rest.
  const rows: number = Math.max(1, (surface.rows || 20) - 1)
  const cols: number = surface.columns || 60

  const rev = props.rev ?? 0
  const fromDisk = String(props.text ?? '').replace(/\r/g, '').split('\n')
  const old: State | null = surface.state && surface.state.path === props.path ? surface.state : null
  // Same file, newer revision: the file changed outside the editor, so take its text
  // and keep the cursor and scroll where they were.
  let m: State = !old
    ? { path: (lastActive = 0, props.path), rev, lines: fromDisk, row: 0, col: 0, top: 0, left: 0, wheel: 0, hwheel: 0, marks: props.marks ?? {}, anchor: null, undo: [] }
    : old.rev === rev
      ? old
      : {
          ...old,
          rev,
          wheel: props.wheel ?? 0,
          hwheel: props.hwheel ?? 0,
          marks: props.marks ?? {},
          lines: fromDisk,
          row: Math.min(old.row, fromDisk.length - 1),
          col: Math.min(old.col, fromDisk[Math.min(old.row, fromDisk.length - 1)].length),
          anchor: null,
        }
  // A paste from the hooks module (it read the clipboard): in once, at the cursor, as one edit.
  let pasted = false
  if (props.paste && !props.readOnly) {
    if (!old) lastPasteId = Math.max(lastPasteId, props.paste.id)
    else if (props.paste.id > lastPasteId) {
      lastPasteId = props.paste.id
      const res = applyInsert(m, props.paste.text)
      m = { ...m, lines: res.lines, row: res.row, col: res.col, anchor: null, undo: [...m.undo.slice(-99), { lines: m.lines, row: m.row, col: m.col }], marks: carry(m.marks, m.lines, res.lines) }
      pasted = true
    }
  }
  live = m

  const ext = (props.path.split('.').pop() ?? '').toLowerCase()
  // The first gutter column holds the revert button of a changed line; one space then separates it from the number.
  const gutterW = String(m.lines.length).length + 3
  const textW = Math.max(8, cols - gutterW - 3)

  // The wheel (a running total from the hooks module, 0 when a file opens) moves the
  // window with no click first; typing or a click brings it back to the cursor.
  const rolled = (props.wheel ?? 0) - m.wheel
  let top = m.top
  if (rolled !== 0) {
    top = Math.max(0, Math.min(Math.max(0, m.lines.length - rows), props.scrollTo ?? m.top))
  } else {
    if (m.row < top) top = m.row
    if (m.row >= top + rows) top = m.row - rows + 1
  }
  let left = m.left
  if ((props.hwheel ?? 0) !== m.hwheel) {
    const longest = m.lines.reduce((n, l) => Math.max(n, l.length), 0)
    left = Math.max(0, Math.min(Math.max(0, longest - textW + 1), props.scrollLeft ?? m.left))
  } else {
    if (!m.hold) {
      if (m.col < left) left = m.col
      if (m.col >= left + textW) left = m.col - textW + 1
    }
  }

  if (pasted) {
    blinkOn = true
    stamp()
    surface.setState(m)
    surface.post({ path: m.path, text: m.lines.join('\n'), top, left })
  }

  const commit = (next: State, changed: boolean) => {
    next.top = top
    next.left = left
    next.hold = holdNext
    holdNext = false
    next.wheel = props.wheel ?? 0
    next.hwheel = props.hwheel ?? 0
    live = next
    blinkOn = true
    surface.setState(next)
    // The hooks module clamps the wheel against this, so it must know where the window is.
    const moved = top !== lastTop || left !== lastLeft
    lastTop = top
    lastLeft = left
    if (changed) surface.post({ path: next.path, text: next.lines.join('\n'), top, left })
    else if (moved) surface.post({ top, left })
  }

  surface.onKey((k: { key: string; ctrl?: true; meta?: true; shift?: true }) => {
    stamp()
    const cur0 = live as State
    const w = { lines: cur0.lines.slice(), row: cur0.row, col: cur0.col, anchor: cur0.anchor }
    let undo = cur0.undo
    let changed = false
    const key = k.key
    const line = () => w.lines[w.row] ?? ''

    const removeSel = () => {
      const r = order(w)
      w.anchor = null
      if (!r) return false
      const [a, b] = r
      const merged = w.lines[a.row].slice(0, a.col) + w.lines[b.row].slice(b.col)
      w.lines.splice(a.row, b.row - a.row + 1, merged)
      w.row = a.row
      w.col = a.col
      changed = true
      return true
    }
    const insert = (t: string) => {
      removeSel()
      const parts = t.split('\n')
      const l = line()
      const tail = l.slice(w.col)
      if (parts.length === 1) {
        w.lines[w.row] = l.slice(0, w.col) + t + tail
        w.col += t.length
      } else {
        w.lines[w.row] = l.slice(0, w.col) + parts[0]
        w.lines.splice(w.row + 1, 0, ...parts.slice(1))
        w.row += parts.length - 1
        w.col = parts[parts.length - 1].length
        w.lines[w.row] += tail
      }
      changed = true
    }
    const selected = () => {
      const r = order(w)
      return r ? slice(w.lines, r[0], r[1]) : ''
    }
    // A move keeps the selection while shift is held, drops it otherwise.
    const move = (fn: () => void) => {
      if (k.shift && !w.anchor) w.anchor = { row: w.row, col: w.col }
      if (!k.shift) w.anchor = null
      fn()
    }

    if (k.ctrl) {
      if (key === 'a') {
        w.anchor = { row: 0, col: 0 }
        w.row = w.lines.length - 1
        w.col = w.lines[w.row].length
      } else if (key === 'c') {
        const t = selected()
        if (t) surface.post({ copy: t })
        return
      } else if (key === 'x') {
        const t = selected()
        if (!t) return
        surface.post({ copy: t })
        removeSel()
      } else if (key === 'v') {
        if (!props.readOnly) surface.post({ paste: true })
        return
      } else if (key === 'z') {
        const prev = undo[undo.length - 1]
        if (!prev || props.readOnly) return
        undo = undo.slice(0, -1)
        w.lines = prev.lines.slice()
        w.row = prev.row
        w.col = prev.col
        w.anchor = null
        const next: State = { ...cur0, lines: w.lines, row: w.row, col: w.col, anchor: null, undo, marks: carry(cur0.marks, cur0.lines, w.lines) }
        commit(next, true)
        return
      } else return
    } else if (k.meta) {
      if (key === 'v' && !props.readOnly) surface.post({ paste: true })
      return
    } else if (key === 'left') {
      move(() => {
        if (w.col > 0) w.col -= 1
        else if (w.row > 0) { w.row -= 1; w.col = w.lines[w.row].length }
      })
    } else if (key === 'right') {
      move(() => {
        if (w.col < line().length) w.col += 1
        else if (w.row < w.lines.length - 1) { w.row += 1; w.col = 0 }
      })
    } else if (key === 'up') {
      move(() => { if (w.row > 0) { w.row -= 1; w.col = Math.min(w.col, line().length) } })
    } else if (key === 'down') {
      move(() => { if (w.row < w.lines.length - 1) { w.row += 1; w.col = Math.min(w.col, line().length) } })
    } else if (key === 'home') move(() => { w.col = 0 })
    else if (key === 'end') move(() => { w.col = line().length })
    else if (key === 'pageup') move(() => { w.row = Math.max(0, w.row - rows); w.col = Math.min(w.col, line().length) })
    else if (key === 'pagedown') move(() => { w.row = Math.min(w.lines.length - 1, w.row + rows); w.col = Math.min(w.col, line().length) })
    else if (key === 'return') {
      const l = line()
      const indent = /^\s*/.exec(l)![0]
      const more = /[{(\[:]\s*$/.test(l.slice(0, w.col)) ? '  ' : ''
      insert('\n' + indent + more)
    } else if (key === 'tab') insert('  ')
    else if (key === 'space') insert(' ')
    else if (key === 'backspace') {
      if (!removeSel()) {
        if (w.col > 0) { const l = line(); w.lines[w.row] = l.slice(0, w.col - 1) + l.slice(w.col); w.col -= 1; changed = true }
        else if (w.row > 0) {
          const prev = w.lines[w.row - 1]
          w.lines.splice(w.row - 1, 2, prev + line())
          w.row -= 1
          w.col = prev.length
          changed = true
        }
      }
    } else if (key === 'delete') {
      if (!removeSel()) {
        const l = line()
        if (w.col < l.length) { w.lines[w.row] = l.slice(0, w.col) + l.slice(w.col + 1); changed = true }
        else if (w.row < w.lines.length - 1) { w.lines.splice(w.row, 2, l + w.lines[w.row + 1]); changed = true }
      }
    } else if (!NAMED.has(key)) insert(key.replace(/\r/g, ''))
    else return

    if (changed && props.readOnly) return
    if (changed) undo = [...undo.slice(-99), { lines: cur0.lines, row: cur0.row, col: cur0.col }]
    commit({ ...cur0, lines: w.lines, row: w.row, col: w.col, anchor: w.anchor, undo, marks: changed ? carry(cur0.marks, cur0.lines, w.lines) : cur0.marks }, changed)
  })

  surface.onPointer((p: { type: string; x: number; y: number; button?: string; shift?: true }) => {
    // The wheel event itself carries no modifiers, so the hooks module learns about shift here.
    if (!!p.shift !== shiftSeen) {
      shiftSeen = !!p.shift
      surface.post({ shift: shiftSeen })
    }
    if (p.type === 'down') stamp()
    const cur0 = live as State
    // Hover: the button lights up under the pointer (the first two columns, so it is easy to hit).
    if (p.type === 'move' && !drag) {
      const over = p.x < 2 && cur0.marks[Math.min(cur0.lines.length - 1, top + p.y)] && props.base ? top + p.y : -1
      if (over !== hoverRow) {
        hoverRow = over
        surface.setState({ ...cur0 })
      }
    }
    const at = () => {
      const row = Math.max(0, Math.min(cur0.lines.length - 1, top + p.y))
      const col = Math.max(0, Math.min(cur0.lines[row].length, left + p.x - gutterW))
      return { row, col }
    }
    if (p.type === 'down' && p.button === 'left' && p.x < 2 && !props.readOnly && props.base) {
      // The revert button in the gutter: only a changed line has one.
      const row = Math.max(0, Math.min(cur0.lines.length - 1, top + p.y))
      if (cur0.marks[row]) {
        const res = revertAt(cur0.lines, props.base, row)
        if (res) {
          const marks = carry(cur0.marks, cur0.lines, res.lines)
          for (const i of res.fixed) delete marks[i]
          const undo = [...cur0.undo.slice(-99), { lines: cur0.lines, row: cur0.row, col: cur0.col }]
          const rr = Math.min(row, res.lines.length - 1)
          commit({ ...cur0, lines: res.lines, row: rr, col: Math.min(cur0.col, (res.lines[rr] ?? '').length), anchor: null, undo, marks }, true)
        }
      }
      return
    }
    if (p.type === 'down' && p.button === 'left') {
      const pos = at()
      // Clicks on the same spot in quick succession: 2 selects the word, 3 the whole line.
      const t = typeof Date !== 'undefined' ? Date.now() : 0
      const again = lastClick && lastClick.row === pos.row && Math.abs(lastClick.col - pos.col) <= 1 && (!t || t - lastClick.t < 500)
      const count = again ? (lastClick as Click).count % 3 + 1 : 1
      lastClick = { row: pos.row, col: pos.col, t, count }
      const text = cur0.lines[pos.row]
      if (count >= 2 && text.length > 0) {
        let a = 0
        let b = text.length
        if (count === 2) {
          const i = Math.min(pos.col, text.length - 1)
          const kind = (c: string) => (/[\w$]/.test(c) ? 1 : /\s/.test(c) ? 2 : 3)
          const k = kind(text[i])
          a = i
          b = i + 1
          while (a > 0 && kind(text[a - 1]) === k) a--
          while (b < text.length && kind(text[b]) === k) b++
        }
        drag = false
        holdNext = count === 3
        commit({ ...cur0, row: pos.row, col: b, anchor: { row: pos.row, col: a } }, false)
        surface.post({ copy: text.slice(a, b) })
        return
      }
      drag = true
      commit({ ...cur0, row: pos.row, col: pos.col, anchor: pos }, false)
    } else if (p.type === 'move' && drag) {
      const pos = at()
      commit({ ...cur0, row: pos.row, col: pos.col }, false)
    } else if (p.type === 'up' && drag) {
      drag = false
      const r = order(cur0)
      if (r) surface.post({ copy: slice(cur0.lines, r[0], r[1]) })
    }
  })

  // Block-comment state needs every line above the window.
  let inBlock = false
  for (let r = 0; r < top; r++) inBlock = tokenize(m.lines[r], ext, inBlock).inBlock

  const sel = order(m)
  const active = isActive()
  const out = []
  // Scroll indicator in the column right of the text: a thumb sized and placed by the window, blank when all fits.
  const total = m.lines.length
  const maxTop = Math.max(0, total - rows)
  const thumb = Math.max(1, Math.round((rows * rows) / Math.max(total, 1)))
  const thumbAt = maxTop > 0 ? Math.round((top / maxTop) * (rows - thumb)) : 0
  const barAt = (i: number) =>
    maxTop <= 0 ? <Text> </Text> : i >= thumbAt && i < thumbAt + thumb ? <Text color="#d97757">█</Text> : <Text color="#3b4048">│</Text>
  for (let r = top; r < Math.min(m.lines.length, top + rows); r++) {
    const text = m.lines[r]
    const t = tokenize(text, ext, inBlock)
    inBlock = t.inBlock
    // Selected columns of this line: [from, to), to = Infinity when it runs on past the line end.
    let from = -1
    let to = -1
    if (sel && r >= sel[0].row && r <= sel[1].row) {
      from = r === sel[0].row ? sel[0].col : 0
      to = r === sel[1].row ? sel[1].col : Infinity
    }
    // One cell per displayed column: a tab shows as two spaces.
    const cells: { ch: string; c: string; sel: boolean }[] = []
    let cursorCell = -1
    let idx = 0
    for (const tok of t.toks) {
      for (const ch of tok.s) {
        if (r === m.row && idx === m.col) cursorCell = cells.length
        const isSel = idx >= from && idx < to
        if (ch === '\t') cells.push({ ch: ' ', c: tok.c, sel: isSel }, { ch: ' ', c: tok.c, sel: isSel })
        else cells.push({ ch: safeChar(ch), c: tok.c, sel: isSel })
        idx += 1
      }
    }
    if (r === m.row && cursorCell < 0) cursorCell = cells.length
    // The cell past the last character: cursor, or the line break of a selection.
    if (cursorCell === cells.length || to === Infinity) cells.push({ ch: ' ', c: C.text, sel: to === Infinity })
    const runs: { s: string; c: string; cur: boolean; sel: boolean }[] = []
    for (let i = left; i < Math.min(cells.length, left + textW); i++) {
      const cell = cells[i]
      const isCur = i === cursorCell && blinkOn && active
      const last = runs[runs.length - 1]
      if (last && last.c === cell.c && last.sel === cell.sel && !last.cur && !isCur) last.s += cell.ch
      else runs.push({ s: cell.ch, c: cell.c, cur: isCur, sel: cell.sel })
    }
    // A line Claude wrote or took out: a faint orange band across the row, its label at the right edge.
    const mark = m.marks[r]
    const isGit = mark === 'g'
    const MARK_BG = isGit ? GIT_BG : CLAUDE_BG
    const MARK_FG = isGit ? GIT_FG : CLAUDE_FG
    const label = ''
    const used = Math.max(0, Math.min(cells.length, left + textW) - left)
    const pad = mark ? Math.max(0, textW - used) : 0
    const fits = mark && label ? pad >= label.length + 1 : false
    const num = String(r + 1).padStart(gutterW - 3, ' ') + ' '
    const canRevert = !!mark && !!props.base && !props.readOnly
    const hot = canRevert && hoverRow === r
    out.push(
      <Text key={'l' + r}>
        <Text color={hot ? '#ffffff' : MARK_FG} bold={hot} backgroundColor={hot ? HOT_BG : mark ? MARK_BG : undefined}>{canRevert ? '↺' : ' '}</Text>
        <Text backgroundColor={mark ? MARK_BG : undefined}>{' '}</Text>
        <Text color={mark ? MARK_FG : r === m.row ? C.gutterOn : C.gutter} backgroundColor={mark ? MARK_BG : undefined}>{num}</Text>
        {runs.map((run, i) => (
          <Text key={i} color={run.c} inverse={run.cur} backgroundColor={run.sel && !run.cur ? SEL_BG : mark ? MARK_BG : undefined}>{run.s}</Text>
        ))}
        {mark && pad > 0 && <Text backgroundColor={MARK_BG}>{' '.repeat(fits ? pad - label.length - 1 : pad)}</Text>}
        {mark && fits && <Text color={MARK_FG} backgroundColor={MARK_BG}>{label + ' '}</Text>}
        {!mark && <Text>{' '.repeat(Math.max(0, textW - used))}</Text>}
        <Text> </Text>
        {barAt(r - top)}
      </Text>,
    )
  }

  // A short file leaves the window half empty: pad it so the bar stays on the last row.
  for (let i = out.length; i < rows; i++) out.push(<Text key={'pad' + i}>{' '.repeat(gutterW + textW + 1)}{barAt(i)}</Text>)

  // The bar: the wheel over this row scrolls sideways; elsewhere it scrolls up and down.
  const longest = m.lines.reduce((n, l) => Math.max(n, l.length), 0)
  const shownTo = Math.min(longest, left + textW)
  const where = longest > textW ? ' ' + (left + 1) + '–' + shownTo + ' / ' + longest + ' ' : ' bez prelaska '
  const hint = ' ◂  ovdje točak skrola vodoravno  ▸ '
  const room = Math.max(0, cols - where.length)
  const lead = Math.max(0, Math.floor((room - hint.length) / 2))
  const barText = (' '.repeat(lead) + (room >= hint.length ? hint : '◂ ▸')).padEnd(room, ' ').slice(0, room) + where
  out.push(
    <Text key="bar" color="#8b93a5" backgroundColor="#2a2f3a">{barText.padEnd(cols, ' ').slice(0, cols)}</Text>,
  )

  return <Box flexDirection="column">{out}</Box>
}
