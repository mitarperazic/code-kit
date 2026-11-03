declare module 'claude-code' {
  interface PluginState {
    'code-kit': {
      open: Shaped<string[]>
      edited: Shaped<string[]>
      home: Shaped<string>
      tick: Shaped<number>
      file: Shaped<string>
      draft: Shaped<string>
      rev: Shaped<number>
      hwheel: Shaped<number>
      treeOff: Shaped<number>
      treeMax: Shaped<number>
      wheel: Shaped<number>
      editCols: Shaped<number>
      copied: Shaped<string>
      stick: Shaped<number>
    }
  }
}
