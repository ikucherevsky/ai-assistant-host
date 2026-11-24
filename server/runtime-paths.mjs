import { resolve } from 'node:path';

export const solutionRoot = resolve(import.meta.dirname, '..');
export const dataDirectory = resolve(solutionRoot, 'local');
