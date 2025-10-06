const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'dist/plugin.js',
  format: 'iife',
  watch,
  minify: true,
}).catch(() => process.exit(1));