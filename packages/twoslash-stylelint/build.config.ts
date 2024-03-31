import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/stylelint-worker',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
})
