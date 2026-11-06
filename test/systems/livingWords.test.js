// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIVING_WORDS } from '../../src/systems/living/livingWords.js';

const rd = (relPath) => readFileSync(new URL('../../' + relPath, import.meta.url), 'utf8');

test('LIVING_WORDS: all strings exist in locales, are bounded in length and return valid strings', () => {
  const enCsv = rd('locales/en/Port_Strings.csv');
  const ruCsv = rd('locales/ru/Port_Strings.csv');

  const accessors = Object.entries(LIVING_WORDS);
  assert.ok(accessors.length >= 10, 'Expected at least 10 localization accessors');

  for (const [name, fn] of accessors) {
    assert.equal(typeof fn, 'function', `${name} should be a function`);
    const line = fn();
    assert.ok(typeof line === 'string' && line.length > 0, `${name} returned empty text`);
    assert.ok(line.split(/\s+/).length <= 35, `${name} text too verbose: "${line}"`);
  }

  // Extract keys from livingWords.js
  const src = rd('src/systems/living/livingWords.js');
  const keys = [...src.matchAll(/t\('(living\.[a-zA-Z.]+)'/g)].map((m) => m[1]);

  assert.equal(keys.length, new Set(keys).size, 'All keys in livingWords.js must be unique');

  for (const key of keys) {
    assert.match(enCsv, new RegExp(`^${key.replace(/\./g, '\\.')},`, 'm'), `${key} missing in locales/en/Port_Strings.csv`);
    assert.match(ruCsv, new RegExp(`^${key.replace(/\./g, '\\.')},`, 'm'), `${key} missing in locales/ru/Port_Strings.csv`);
  }
});

