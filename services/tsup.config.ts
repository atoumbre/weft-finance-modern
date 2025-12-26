import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/**/*.ts',
  ],
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
  format: ['cjs', 'esm'], // AWS Lambda Node.js runtime primarily uses CommonJS (cjs)
  dts: true,
  external: ['aws-sdk'], // Mark AWS SDK as external since it's available in the Lambda environment
  target: 'node22',
  outDir: 'dist',
})
