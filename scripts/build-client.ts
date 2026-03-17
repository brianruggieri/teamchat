#!/usr/bin/env bun

import * as fs from 'node:fs';
import * as path from 'node:path';

const outDir = path.resolve(import.meta.dirname ?? '.', '..', 'dist', 'client');

// Ensure output dir exists
fs.mkdirSync(outDir, { recursive: true });

// Bundle the React app
const result = await Bun.build({
	entrypoints: [path.resolve(import.meta.dirname ?? '.', '..', 'src', 'client', 'App.tsx')],
	outdir: outDir,
	naming: 'app.js',
	target: 'browser',
	format: 'esm',
	minify: false,
	sourcemap: 'external',
	define: {
		'process.env.NODE_ENV': '"production"',
	},
	external: [],
});

if (!result.success) {
	console.error('Build failed:');
	for (const msg of result.logs) {
		console.error(msg);
	}
	process.exit(1);
}

// Copy static assets
const srcClient = path.resolve(import.meta.dirname ?? '.', '..', 'src', 'client');

// Copy index.html
fs.copyFileSync(path.join(srcClient, 'index.html'), path.join(outDir, 'index.html'));

// Copy all CSS files from styles/
const stylesDir = path.join(outDir, 'styles');
fs.mkdirSync(stylesDir, { recursive: true });
const srcStylesDir = path.join(srcClient, 'styles');
for (const file of fs.readdirSync(srcStylesDir)) {
	if (file.endsWith('.css')) {
		fs.copyFileSync(path.join(srcStylesDir, file), path.join(stylesDir, file));
	}
}

console.log(`Client built to ${outDir}`);
for (const artifact of result.outputs) {
	console.log(`  ${path.basename(artifact.path)} (${(artifact.size / 1024).toFixed(1)} KB)`);
}
