import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('./credential-tutorial.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
);
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const {
  DEFAULT_CREDENTIAL_TUTORIAL_TITLE,
  MAX_CREDENTIAL_TUTORIAL_TITLE_LENGTH,
  MAX_CREDENTIAL_TUTORIAL_CONTENT_LENGTH,
  getProductCredentialTutorial,
  validateProductCredentialTutorial,
} = context.exports;

const netflix = {
  credential_tutorial_enabled: true,
  credential_tutorial_title: 'Cara Login Netflix',
  credential_tutorial_content: '1. Buka Netflix.\n2. Pilih **profil yang diberikan**.',
};
const canva = {
  credential_tutorial_enabled: true,
  credential_tutorial_title: 'Aktivasi Canva',
  credential_tutorial_content: '1. Buka tautan undangan Canva.\n2. Bergabung ke tim.',
};

test('each purchased product resolves its own instructions when switching between orders', () => {
  for (const product of [netflix, canva, netflix]) {
    const tutorial = getProductCredentialTutorial(product);
    assert.equal(tutorial.title, product.credential_tutorial_title);
    assert.equal(tutorial.content, product.credential_tutorial_content);
  }
  const edited = { ...netflix, credential_tutorial_content: '1. Petunjuk Netflix terbaru.' };
  assert.equal(getProductCredentialTutorial(edited).content, edited.credential_tutorial_content);
  assert.equal(getProductCredentialTutorial(canva).content, canva.credential_tutorial_content);
});

test('missing, blank, or disabled product tutorials never fall back to another product or global instructions', () => {
  for (const product of [
    undefined,
    null,
    {},
    { ...netflix, credential_tutorial_enabled: false },
    { ...netflix, credential_tutorial_content: null },
    { ...netflix, credential_tutorial_content: ' \n ' },
  ]) {
    assert.equal(getProductCredentialTutorial(product), null);
  }
  const unnamed = getProductCredentialTutorial({ ...canva, credential_tutorial_title: '' });
  assert.equal(unnamed.title, DEFAULT_CREDENTIAL_TUTORIAL_TITLE);
  assert.equal(unnamed.content, canva.credential_tutorial_content);
});

test('product saves accept Markdown, explicit clears, and unrelated partial updates', () => {
  for (const payload of [
    netflix,
    { status: 'inactive' },
    { credential_tutorial_enabled: false },
    { credential_tutorial_title: null, credential_tutorial_content: null },
    {
      credential_tutorial_title: 'a'.repeat(MAX_CREDENTIAL_TUTORIAL_TITLE_LENGTH),
      credential_tutorial_content: 'a'.repeat(MAX_CREDENTIAL_TUTORIAL_CONTENT_LENGTH),
    },
  ]) {
    assert.equal(validateProductCredentialTutorial(payload), null);
  }
});

test('product saves reject invalid types and oversized tutorial fields before database writes', () => {
  for (const payload of [
    { credential_tutorial_enabled: 'true' },
    { credential_tutorial_enabled: null },
    { credential_tutorial_title: 123 },
    { credential_tutorial_content: { text: 'invalid' } },
    { credential_tutorial_title: 'a'.repeat(MAX_CREDENTIAL_TUTORIAL_TITLE_LENGTH + 1) },
    { credential_tutorial_content: 'a'.repeat(MAX_CREDENTIAL_TUTORIAL_CONTENT_LENGTH + 1) },
  ]) {
    assert.equal(typeof validateProductCredentialTutorial(payload), 'string');
  }
});
