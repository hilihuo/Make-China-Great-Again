import { build, createServer, preview } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] ?? 'dev';
const args = process.argv.slice(3);

function readOption(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1] || args[index + 1].startsWith('--')) {
    return fallback;
  }
  return args[index + 1];
}

const host = readOption('--host', '127.0.0.1');
const baseConfig = {
  configFile: false,
  root: projectRoot,
  base: './'
};

if (command === 'build') {
  await build({
    ...baseConfig,
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  });
} else if (command === 'preview') {
  const server = await preview({
    ...baseConfig,
    preview: {
      host,
      port: 4173,
      open: true
    }
  });
  server.printUrls();
} else if (command === 'dev') {
  const server = await createServer({
    ...baseConfig,
    server: {
      host,
      port: 3000,
      open: true
    }
  });
  await server.listen();
  server.printUrls();
} else {
  throw new Error(`Unknown Vite command: ${command}`);
}
