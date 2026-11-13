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

test('LIVING_WORDS: roll degree and event option strings contain no phantom XP, renown, virtue, or underworld mentions', () => {
  assert.equal(LIVING_WORDS.notifyXpGained, undefined, 'notifyXpGained must not exist');
  assert.equal(LIVING_WORDS.notifyBountyIssued, undefined, 'notifyBountyIssued must not exist');

  const triumph = LIVING_WORDS.rollTriumph(80, 50);
  const success = LIVING_WORDS.rollSuccess(60, 50);
  const partial = LIVING_WORDS.rollPartial(45, 50);
  const pleaHelp = LIVING_WORDS.pleaOptionHelp(25);
  const rebelsOpt = LIVING_WORDS.urbanSkirmishOptionRebels();
  const rebelsJoined = LIVING_WORDS.eventJoinedRebels();

  for (const text of [triumph, success, partial]) {
    assert.doesNotMatch(text, /\bXP\b/i, `Roll message contains phantom XP: "${text}"`);
    assert.doesNotMatch(text, /bonus renown/i, `Roll message contains phantom bonus renown: "${text}"`);
  }

  assert.doesNotMatch(pleaHelp, /\+Renown/i, `Plea help option contains phantom Renown: "${pleaHelp}"`);
  assert.doesNotMatch(pleaHelp, /\+Virtue/i, `Plea help option contains phantom Virtue: "${pleaHelp}"`);
  assert.doesNotMatch(pleaHelp, /Добродетель/i, `Plea help option contains phantom Virtue: "${pleaHelp}"`);

  assert.doesNotMatch(rebelsOpt, /Underworld/i, `Rebel option contains phantom Underworld: "${rebelsOpt}"`);
  assert.doesNotMatch(rebelsOpt, /воровском/i, `Rebel option contains phantom Underworld: "${rebelsOpt}"`);
  assert.doesNotMatch(rebelsJoined, /Underworld/i, `Rebel joined contains phantom Underworld: "${rebelsJoined}"`);
  assert.doesNotMatch(rebelsJoined, /преступном/i, `Rebel joined contains phantom Underworld: "${rebelsJoined}"`);
});

test('LIVING_WORDS: all 26 catalog locales have localized non-English strings for choice & contract keys', () => {
  const catalog = [
    'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja',
    'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant',
  ];

  const auditedKeys = [
    'living.checkpoint.optKnight',
    'living.contract.completed',
    'living.naval.choiceLaw',
    'living.naval.choicePirates',
    'living.plea.optHelp',
  ];

  const enCsv = rd('locales/en/Port_Strings.csv');
  const enLines = Object.fromEntries(
    enCsv.split('\n').filter(Boolean).map((line) => {
      const idx = line.indexOf(',');
      return [line.slice(0, idx), line.slice(idx + 1).trim()];
    }),
  );

  for (const loc of catalog) {
    const csv = rd(`locales/${loc}/Port_Strings.csv`);
    const locLines = Object.fromEntries(
      csv.split('\n').filter(Boolean).map((line) => {
        const idx = line.indexOf(',');
        return [line.slice(0, idx), line.slice(idx + 1).trim()];
      }),
    );

    for (const key of auditedKeys) {
      assert.ok(locLines[key], `Missing ${key} in ${loc}`);
      if (loc !== 'en') {
        assert.notEqual(
          locLines[key],
          enLines[key],
          `Locale ${loc} must have translated string for ${key}, but fell back to English: ${locLines[key]}`,
        );
      }
    }
  }
});

test('LIVING_WORDS: notify and roll keys across all 26 locales contain no XP or phantom bounty mentions', () => {
  const catalog = [
    'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja',
    'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant',
  ];

  for (const loc of catalog) {
    const csv = rd(`locales/${loc}/Port_Strings.csv`);
    assert.doesNotMatch(csv, /^living\.notify\.xpGained,/m, `${loc} must not contain living.notify.xpGained`);
    assert.doesNotMatch(csv, /^living\.notify\.bountyIssued,/m, `${loc} must not contain living.notify.bountyIssued`);

    const lines = csv.split('\n');
    for (const line of lines) {
      if (
        line.startsWith('living.roll.triumph,') ||
        line.startsWith('living.roll.success,') ||
        line.startsWith('living.roll.partial,') ||
        line.startsWith('living.notify.')
      ) {
        assert.doesNotMatch(line, /\bXP\b/i, `Found phantom XP in ${loc}: "${line}"`);
      }
    }
  }
});

