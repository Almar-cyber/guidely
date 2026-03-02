import esbuild from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'

const watch = process.argv.includes('--watch')

// Build main thread
async function buildMain() {
  const ctx = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    outfile: 'dist/main.js',
    target: 'es2017',
    format: 'iife',
    logLevel: 'info',
  })
  if (watch) {
    await ctx.watch()
    console.log('[main] watching...')
  } else {
    await ctx.rebuild()
    await ctx.dispose()
    console.log('[main] built ✓')
  }
}

// Build UI (React → inline HTML)
async function buildUI() {
  const ctx = await esbuild.context({
    entryPoints: ['src/ui/main.tsx'],
    bundle: true,
    outfile: 'dist/ui-bundle.js',
    target: 'es2017',
    format: 'iife',
    jsx: 'automatic',
    logLevel: 'info',
    plugins: [
      {
        name: 'inline-html',
        setup(build) {
          build.onEnd(() => {
            const js = readFileSync('dist/ui-bundle.js', 'utf8')
            const template = readFileSync('src/ui/index.html', 'utf8')
            const html = template.replace('<!-- INJECT_SCRIPT -->', `<script>${js}</script>`)
            writeFileSync('dist/ui.html', html)
            console.log('[ui] built ✓')
          })
        },
      },
    ],
  })
  if (watch) {
    await ctx.watch()
    console.log('[ui] watching...')
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
}

await Promise.all([buildMain(), buildUI()])
