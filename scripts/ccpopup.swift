// code-kit popup: a small dark window with the orange accent.
// Usage: ccpopup '<json>' [timeoutSeconds]
//   {"mode":"done","project":"parking","heading":"GOTOVO","body":"...","ok":"Idi na terminal"}
//   {"mode":"ask","project":"parking","questions":[{"header":"Boja","question":"...","multi":false,
//     "options":[{"label":"Plava","description":"..."}]}]}
// Prints one JSON line: {"action":"ok"|"close"|"terminal"|"timeout"} or {"action":"answers","answers":{...}}

import Cocoa

let W: CGFloat = 480
let PAD: CGFloat = 24
let ORANGE = NSColor(srgbRed: 0.851, green: 0.467, blue: 0.341, alpha: 1)
let BG = NSColor(srgbRed: 0.105, green: 0.105, blue: 0.11, alpha: 1)
let CARD = NSColor(srgbRed: 0.15, green: 0.15, blue: 0.155, alpha: 1)
let DIM = NSColor(white: 0.62, alpha: 1)
let LINE = NSColor(white: 1, alpha: 0.09)

func emit(_ o: [String: Any]) -> Never {
    let d = try! JSONSerialization.data(withJSONObject: o)
    FileHandle.standardOutput.write(d)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    exit(0)
}

func lbl(_ s: String, _ size: CGFloat, _ w: NSFont.Weight, _ c: NSColor, width: CGFloat) -> NSTextField {
    let t = NSTextField(wrappingLabelWithString: s)
    t.font = .systemFont(ofSize: size, weight: w)
    t.textColor = c
    t.isSelectable = false
    t.maximumNumberOfLines = 0
    t.translatesAutoresizingMaskIntoConstraints = false
    t.preferredMaxLayoutWidth = width
    t.widthAnchor.constraint(equalToConstant: width).isActive = true
    return t
}

class Clickable: NSView {
    var onClick: (() -> Void)?
    override func mouseDown(with event: NSEvent) { onClick?() }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .pointingHand) }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class Row: Clickable {
    var title: NSTextField?
    var selected = false { didSet { refresh() } }

    init(content: NSView, width: CGFloat) {
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 10
        layer?.borderWidth = 1
        translatesAutoresizingMaskIntoConstraints = false
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(content)
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: width),
            content.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            content.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            content.topAnchor.constraint(equalTo: topAnchor, constant: 11),
            content.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -11),
        ])
        refresh()
    }
    required init?(coder: NSCoder) { fatalError() }

    func refresh() {
        layer?.borderColor = (selected ? ORANGE : LINE).cgColor
        layer?.backgroundColor = (selected ? ORANGE.withAlphaComponent(0.13) : CARD).cgColor
        title?.textColor = selected ? ORANGE : .white
    }
}

final class Pill: Clickable {
    let text: NSTextField
    let primary: Bool
    var enabled = true { didSet { style() } }

    init(_ title: String, primary: Bool) {
        self.primary = primary
        text = NSTextField(labelWithString: title)
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 8
        translatesAutoresizingMaskIntoConstraints = false
        text.font = .systemFont(ofSize: 13, weight: primary ? .semibold : .medium)
        text.translatesAutoresizingMaskIntoConstraints = false
        addSubview(text)
        NSLayoutConstraint.activate([
            text.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            text.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            text.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            text.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
        ])
        style()
    }
    required init?(coder: NSCoder) { fatalError() }

    func style() {
        if primary {
            layer?.backgroundColor = (enabled ? ORANGE : ORANGE.withAlphaComponent(0.30)).cgColor
            text.textColor = enabled ? .white : NSColor(white: 1, alpha: 0.55)
        } else {
            layer?.backgroundColor = NSColor.clear.cgColor
            text.textColor = DIM
        }
    }
    override func mouseDown(with event: NSEvent) { if enabled { onClick?() } }
}

final class Win: NSWindow {
    var onEscape: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override func cancelOperation(_ sender: Any?) { onEscape?() }
}

struct Opt { let label: String; let desc: String }
struct Q { let header: String; let question: String; let multi: Bool; let options: [Opt] }

final class Flow: NSObject, NSTextFieldDelegate {
    let cfg: [String: Any]
    let project: String
    let win: Win
    let root = NSStackView()
    var qs: [Q] = []
    var idx = 0
    var sel: [Set<Int>] = []
    var other: [String] = []
    var rows: [Row] = []
    var otherRow: Row?
    var otherField: NSTextField?
    var next: Pill?
    var onReturn: (() -> Void)?
    var placed = false
    let iw = W - 2 * PAD

    init(cfg: [String: Any]) {
        self.cfg = cfg
        project = (cfg["project"] as? String) ?? ""
        win = Win(contentRect: NSRect(x: 0, y: 0, width: W, height: 200), styleMask: [.borderless], backing: .buffered, defer: false)
        super.init()

        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = true
        win.level = .floating
        win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let cv = NSView()
        cv.wantsLayer = true
        cv.layer?.backgroundColor = BG.cgColor
        cv.layer?.cornerRadius = 14
        cv.layer?.masksToBounds = true
        cv.layer?.borderWidth = 1
        cv.layer?.borderColor = LINE.cgColor
        win.contentView = cv

        root.orientation = .vertical
        root.alignment = .leading
        root.spacing = 10
        root.edgeInsets = NSEdgeInsets(top: PAD + 3, left: PAD, bottom: PAD, right: PAD)
        root.translatesAutoresizingMaskIntoConstraints = false
        cv.addSubview(root)

        let bar = NSView()
        bar.wantsLayer = true
        bar.layer?.backgroundColor = ORANGE.cgColor
        bar.translatesAutoresizingMaskIntoConstraints = false
        cv.addSubview(bar)

        NSLayoutConstraint.activate([
            root.topAnchor.constraint(equalTo: cv.topAnchor),
            root.leadingAnchor.constraint(equalTo: cv.leadingAnchor),
            root.trailingAnchor.constraint(equalTo: cv.trailingAnchor),
            root.bottomAnchor.constraint(equalTo: cv.bottomAnchor),
            bar.topAnchor.constraint(equalTo: cv.topAnchor),
            bar.leadingAnchor.constraint(equalTo: cv.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: cv.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 3),
        ])

        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] ev in
            if ev.keyCode == 36 || ev.keyCode == 76, let r = self?.onReturn {
                r()
                return nil
            }
            return ev
        }

        if (cfg["mode"] as? String) == "ask" {
            for q in (cfg["questions"] as? [[String: Any]]) ?? [] {
                let opts = ((q["options"] as? [[String: Any]]) ?? []).map {
                    Opt(label: ($0["label"] as? String) ?? "", desc: ($0["description"] as? String) ?? "")
                }
                qs.append(Q(header: (q["header"] as? String) ?? "", question: (q["question"] as? String) ?? "",
                            multi: (q["multi"] as? Bool) ?? false, options: opts))
            }
            if qs.isEmpty { emit(["action": "terminal"]) }
            sel = Array(repeating: [], count: qs.count)
            other = Array(repeating: "", count: qs.count)
            win.onEscape = { emit(["action": "terminal"]) }
            showStep()
        } else {
            win.onEscape = { emit(["action": "close"]) }
            showDone()
        }
    }

    func clear() {
        for v in root.arrangedSubviews { root.removeArrangedSubview(v); v.removeFromSuperview() }
        rows = []
        otherRow = nil
        otherField = nil
        next = nil
        onReturn = nil
    }

    func fit() {
        win.contentView?.layoutSubtreeIfNeeded()
        let h = root.fittingSize.height
        if !placed {
            win.setContentSize(NSSize(width: W, height: h))
            win.center()
            placed = true
        } else {
            let f = win.frame
            win.setFrame(NSRect(x: f.minX, y: f.maxY - h, width: W, height: h), display: true)
        }
    }

    func footer(_ left: Pill?, _ right: [Pill]) -> NSStackView {
        let f = NSStackView()
        f.orientation = .horizontal
        f.alignment = .centerY
        f.spacing = 6
        f.translatesAutoresizingMaskIntoConstraints = false
        f.widthAnchor.constraint(equalToConstant: iw).isActive = true
        if let l = left { f.addArrangedSubview(l) }
        let sp = NSView()
        sp.translatesAutoresizingMaskIntoConstraints = false
        sp.setContentHuggingPriority(.defaultLow, for: .horizontal)
        f.addArrangedSubview(sp)
        for r in right { f.addArrangedSubview(r) }
        return f
    }

    // MARK: finished

    func showDone() {
        clear()
        root.addArrangedSubview(lbl("\(project.uppercased())  ·  ZAVRŠENO", 11, .semibold, ORANGE, width: iw))
        let heading = (cfg["heading"] as? String) ?? ""
        let body = (cfg["body"] as? String) ?? ""
        if !heading.isEmpty { root.addArrangedSubview(lbl(heading, 20, .semibold, .white, width: iw)) }
        if !body.isEmpty { root.addArrangedSubview(lbl(body, 13, .regular, DIM, width: iw)) }
        let close = Pill("Zatvori", primary: false)
        close.onClick = { emit(["action": "close"]) }
        let ok = Pill((cfg["ok"] as? String) ?? "Idi na terminal", primary: true)
        ok.onClick = { emit(["action": "ok"]) }
        let f = footer(nil, [close, ok])
        root.addArrangedSubview(f)
        root.setCustomSpacing(18, after: root.arrangedSubviews[root.arrangedSubviews.count - 2])
        onReturn = { emit(["action": "ok"]) }
        fit()
    }

    // MARK: questions

    func showStep() {
        clear()
        let q = qs[idx]
        var head = "\(project.uppercased())  ·  \(q.header.uppercased())"
        if qs.count > 1 { head += "  ·  \(idx + 1)/\(qs.count)" }
        root.addArrangedSubview(lbl(head, 11, .semibold, ORANGE, width: iw))
        let qt = lbl(q.question, 17, .semibold, .white, width: iw)
        root.addArrangedSubview(qt)
        if q.multi {
            root.addArrangedSubview(lbl("Izaberi jednu ili više stavki", 12, .regular, DIM, width: iw))
        }
        root.setCustomSpacing(16, after: root.arrangedSubviews.last!)

        for (i, o) in q.options.enumerated() {
            let box = NSStackView()
            box.orientation = .vertical
            box.alignment = .leading
            box.spacing = 2
            let t = lbl(o.label, 14, .medium, .white, width: iw - 28)
            box.addArrangedSubview(t)
            if !o.desc.isEmpty { box.addArrangedSubview(lbl(o.desc, 12, .regular, DIM, width: iw - 28)) }
            let row = Row(content: box, width: iw)
            row.title = t
            row.onClick = { [weak self] in self?.toggle(i) }
            rows.append(row)
            root.addArrangedSubview(row)
        }

        let field = NSTextField(string: other[idx])
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = .systemFont(ofSize: 14, weight: .regular)
        field.textColor = .white
        field.placeholderAttributedString = NSAttributedString(
            string: "Drugo: upiši svoj odgovor",
            attributes: [.foregroundColor: DIM, .font: NSFont.systemFont(ofSize: 14)])
        field.delegate = self
        field.translatesAutoresizingMaskIntoConstraints = false
        field.widthAnchor.constraint(equalToConstant: iw - 28).isActive = true
        let orow = Row(content: field, width: iw)
        orow.onClick = { [weak self] in self?.win.makeFirstResponder(field) }
        otherRow = orow
        otherField = field
        root.addArrangedSubview(orow)
        root.setCustomSpacing(18, after: orow)

        let terminal = Pill("Odgovoriću u terminalu", primary: false)
        terminal.onClick = { emit(["action": "terminal"]) }
        var right: [Pill] = []
        if idx > 0 {
            let back = Pill("Nazad", primary: false)
            back.onClick = { [weak self] in self?.go(-1) }
            right.append(back)
        }
        let nx = Pill(idx + 1 < qs.count ? "Dalje" : "Pošalji", primary: true)
        nx.onClick = { [weak self] in self?.advance() }
        next = nx
        right.append(nx)
        root.addArrangedSubview(footer(terminal, right))
        onReturn = { [weak self] in self?.advance() }
        refreshSel()
        fit()
    }

    func toggle(_ i: Int) {
        let q = qs[idx]
        if q.multi {
            if sel[idx].contains(i) { sel[idx].remove(i) } else { sel[idx].insert(i) }
        } else {
            sel[idx] = [i]
            other[idx] = ""
            otherField?.stringValue = ""
        }
        refreshSel()
    }

    func controlTextDidChange(_ n: Notification) {
        other[idx] = otherField?.stringValue ?? ""
        if !qs[idx].multi && !other[idx].trimmingCharacters(in: .whitespaces).isEmpty { sel[idx] = [] }
        refreshSel()
    }

    func hasOther() -> Bool { !other[idx].trimmingCharacters(in: .whitespaces).isEmpty }

    func refreshSel() {
        for (i, r) in rows.enumerated() { r.selected = sel[idx].contains(i) }
        otherRow?.selected = hasOther()
        next?.enabled = !sel[idx].isEmpty || hasOther()
    }

    func go(_ d: Int) {
        idx += d
        showStep()
    }

    func advance() {
        guard next?.enabled == true else { return }
        if idx + 1 < qs.count { go(1); return }
        var answers: [String: String] = [:]
        for (k, q) in qs.enumerated() {
            var picked = sel[k].sorted().map { q.options[$0].label }
            let o = other[k].trimmingCharacters(in: .whitespaces)
            if !o.isEmpty { picked.append(o) }
            answers[q.question] = picked.joined(separator: ", ")
        }
        emit(["action": "answers", "answers": answers])
    }
}

// MARK: main

let args = CommandLine.arguments
guard args.count > 1, let data = args[1].data(using: .utf8),
      let cfg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
    emit(["action": "close"])
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let flow = Flow(cfg: cfg)
flow.win.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
if args.count > 2, let secs = Double(args[2]) {
    DispatchQueue.main.asyncAfter(deadline: .now() + secs) { emit(["action": "timeout"]) }
}
app.run()
