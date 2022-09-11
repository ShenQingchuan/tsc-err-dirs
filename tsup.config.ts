import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./src'],
  format: ['esm'],
  target: 'node16',
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
})
