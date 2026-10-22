// Shared fixtures: the real committed datasets (tests run against what the page ships).
import fs from 'node:fs';
import {buildModel} from '../js/model.js';
export const readJSON = rel => JSON.parse(fs.readFileSync(new URL(`../${rel}`, import.meta.url)));
let cached = null;
export function realModel() {
  if (!cached) cached = buildModel(readJSON('data/grocery.json'), readJSON('data/areas.json'));
  return cached;
}
