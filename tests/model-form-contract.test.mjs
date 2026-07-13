import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyEndpointSelection,
  applyLabelSelection,
  buildLabelSuggestions,
  buildModelSelectionPatch,
  findExistingModelByLabel,
  formatEndpointOption,
  getFormDisabledState,
  getAddFirstModelInfo,
  hasSelectedModel,
  normalizeEndpointUrl,
  resolveModelField,
  resolvePromptState,
  toggleUnlimitedMultiturn,
} from '../app/admin/models/components/model-form-helpers.mjs';

const formSourceUrl = new URL('../app/admin/models/components/ModelForm.jsx', import.meta.url);
const pageSourceUrl = new URL('../app/admin/models/page.js', import.meta.url);
const actionsSourceUrl = new URL('../app/admin/models/components/model-form/ModelFormActions.jsx', import.meta.url);
const behaviorSourceUrl = new URL('../app/admin/models/components/model-form/ModelBehaviorFields.jsx', import.meta.url);
const nameSourceUrl = new URL('../app/admin/models/components/model-form/ModelNameField.jsx', import.meta.url);

const categories = {
  alpha: {
    models: [
      { id: 'alpha-0', label: 'Shared', endpoint: 'http://one', systemPrompt: ['first'] },
      { id: 'alpha-1', label: 'Other', endpoint: 'http://two', systemPrompt: ['other'] },
    ],
  },
  beta: {
    models: [
      { id: 'beta-0', label: 'Shared', endpoint: 'http://three', systemPrompt: ['later'] },
      { id: 'beta-1', label: 'shared', endpoint: 'http://four', systemPrompt: [] },
    ],
  },
};

test('Given the public ModelForm API, when refactored, then both call sites and ordered props stay unchanged', async () => {
  const [formSource, pageSource] = await Promise.all([
    readFile(formSourceUrl, 'utf8'),
    readFile(pageSourceUrl, 'utf8'),
  ]);
  const signature = formSource.match(/export function ModelForm\(\{([\s\S]*?)\n\}\) \{/);
  const props = signature?.[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').replace(/,/g, '').trim())
    .filter(Boolean);

  assert.deepEqual(props, [
    'mode', 'formData', 'onFormChange', 'onSave', 'onCancel', 'endpoints',
    'availableModels', 'setAvailableModels', 'modelsLoading', 'roundRobinInfo',
    'labelRoundRobinInfo', 'checkingRoundRobin', 'buildManualPreset',
    'modelLabelRoundRobinMap', 'getFirstModelInRoundRobinGroup',
    'onModelSelectFocus', 'selectedEndpoint', 'setSelectedEndpoint', 'modelConfig',
    'editingModel', 'loading', 't',
  ]);
  assert.equal((pageSource.match(/<ModelForm/g) || []).length, 2);
  const componentOrder = [
    '<AddModelLabelField',
    '<EndpointSelector',
    '<ModelIdentityFields',
    '<ModelBehaviorFields',
    '<ModelFormActions',
  ].map((component) => formSource.indexOf(component));
  assert.ok(componentOrder.every((index) => index >= 0));
  assert.deepEqual(componentOrder, [...componentOrder].sort((left, right) => left - right));
});

test('Given endpoint choices, when rendered or selected, then labels and callback order stay stable', () => {
  assert.equal(formatEndpointOption({ provider: 'openai-compatible', name: 'Cloud', url: 'https://x/v1' }), '[OpenAI] Cloud (https://x/v1)');
  assert.equal(formatEndpointOption({ provider: 'gemini', url: 'https://g' }), '[Gemini] https://g');
  assert.equal(formatEndpointOption({ provider: 'model-server', url: 'http://local' }), '[Ollama] http://local');
  assert.equal(formatEndpointOption({ provider: 'custom', url: 'https://c' }), '[custom] https://c');

  const calls = [];
  applyEndpointSelection({
    endpoint: 'manual',
    apiConfig: 'old',
    buildManualPreset: (provider) => `preset:${provider}`,
    onFormChange: (patch) => calls.push(['change', patch]),
    setAvailableModels: (models) => calls.push(['models', models]),
    setSelectedEndpoint: (endpoint) => calls.push(['endpoint', endpoint]),
  });
  assert.deepEqual(calls, [
    ['change', { endpoint: 'manual', apiConfig: 'preset:openai-compatible' }],
    ['models', []],
    ['endpoint', 'manual'],
  ]);
});

test('Given valid and malformed endpoints, when model field mode resolves, then provider behavior stays stable', () => {
  assert.equal(normalizeEndpointUrl('HTTPS://Example.COM:443/v1///'), 'https://example.com/v1');
  assert.equal(normalizeEndpointUrl(' NOT A URL/// '), 'not a url');
  const endpoints = [
    { url: 'https://api.example/v1/', provider: 'openai-compatible' },
    { url: 'not a url/', provider: 'gemini' },
  ];
  assert.deepEqual(resolveModelField({ effectiveEndpoint: 'https://API.example/v1', endpoints }), {
    isManual: false,
    provider: 'openai-compatible',
    isOllama: false,
  });
  assert.equal(resolveModelField({ effectiveEndpoint: 'not a url', endpoints }).provider, 'gemini');
  assert.equal(resolveModelField({ effectiveEndpoint: 'manual', endpoints }).isManual, true);
  assert.equal(resolveModelField({ effectiveEndpoint: 'https://unknown', endpoints }).isOllama, true);
});

test('Given model and label data, when choosing and suggesting, then auto-label and dedup stay stable', () => {
  assert.deepEqual(buildModelSelectionPatch('gemma3:1b', ''), {
    id: 'gemma3:1b', modelName: 'gemma3:1b', label: 'gemma3:1b',
  });
  assert.equal(buildModelSelectionPatch('gemma3:1b', 'Display').label, 'Display');
  assert.equal(hasSelectedModel([{ id: 'x', name: 'gemma3:1b' }], { id: 'other', modelName: 'gemma3:1b' }), true);
  assert.equal(hasSelectedModel([], { id: 'legacy', modelName: '' }), false);
  assert.equal(findExistingModelByLabel({ categories }, 'Shared').id, 'beta-0');
  assert.deepEqual(buildLabelSuggestions({ categories }, 'sha'), ['Shared', 'shared']);

  const calls = [];
  applyLabelSelection({
    label: 'Shared',
    announceChange: true,
    formData: { id: 'draft', endpoint: 'http://draft' },
    modelConfig: { categories },
    onFormChange: (patch) => calls.push(['change', patch]),
    setSelectedEndpoint: (endpoint) => calls.push(['endpoint', endpoint]),
  });
  assert.deepEqual(calls, [
    ['change', { label: 'Shared' }],
    ['change', { label: 'Shared', id: 'beta-0', endpoint: 'http://three' }],
    ['endpoint', 'http://three'],
  ]);

  const staleCalls = [];
  applyLabelSelection({
    label: 'Removed suggestion',
    announceChange: false,
    formData: { id: 'draft', endpoint: 'http://draft' },
    modelConfig: { categories: {} },
    onFormChange: (patch) => staleCalls.push(patch),
    setSelectedEndpoint: () => staleCalls.push('unexpected endpoint change'),
  });
  assert.deepEqual(staleCalls, [
    { label: 'Removed suggestion', id: 'draft', endpoint: 'http://draft' },
  ]);
});

test('Given round-robin members, when add mode resolves the owner, then first member and shared prompt stay stable', () => {
  const modelConfig = { categories };
  const groupMap = {
    shared: {
      isRoundRobin: true,
      members: [
        { categoryKey: 'beta', modelIndex: 1 },
        { categoryKey: 'alpha', modelIndex: 0 },
      ],
    },
  };
  const first = getAddFirstModelInfo({ label: ' Shared ', modelConfig, modelLabelRoundRobinMap: groupMap });
  assert.equal(first.model.id, 'alpha-0');
  assert.deepEqual(resolvePromptState({ firstModelInfo: first, formSystemPrompt: ['draft'] }), {
    isShared: true,
    systemPrompt: ['first'],
  });
  assert.deepEqual(resolvePromptState({ firstModelInfo: null, formSystemPrompt: ['draft'] }), {
    isShared: false,
    systemPrompt: ['draft'],
  });
});

test('Given multiturn and loading states, when toggled, then unlimited and disabled contracts stay stable', () => {
  assert.deepEqual(toggleUnlimitedMultiturn(true, '8'), { multiturnUnlimited: true, multiturnLimit: '' });
  assert.deepEqual(toggleUnlimitedMultiturn(false, '8'), { multiturnUnlimited: false, multiturnLimit: '8' });
  assert.deepEqual(
    getFormDisabledState({ modelsLoading: true, multiturnUnlimited: true, loading: true }),
    {
      modelSelect: true,
      multiturnLimit: true,
      multiturnUnlimited: true,
      save: false,
      cancel: false,
    }
  );
});

test('Given flags and actions, when components are extracted, then bindings and save-cancel order stay stable', async () => {
  const [actionsSource, behaviorSource, nameSource] = await Promise.all([
    readFile(actionsSourceUrl, 'utf8'),
    readFile(behaviorSourceUrl, 'utf8'),
    readFile(nameSourceUrl, 'utf8'),
  ]);
  for (const flag of ['isDefault', 'adminOnly', 'visible']) {
    assert.match(actionsSource, new RegExp(`checked=\\{formData\\.${flag}\\}`));
    assert.match(actionsSource, new RegExp(`onFormChange\\(\\{ ${flag}: event\\.target\\.checked \\}\\)`));
  }
  assert.ok(actionsSource.indexOf('onClick={onSave}') < actionsSource.indexOf('onClick={onCancel}'));
  assert.match(nameSource, /const disabled = modelsLoading;/);
  assert.match(nameSource, /disabled=\{disabled\}/);
  assert.match(behaviorSource, /disabled=\{disabled\.multiturnLimit\}/);
  assert.match(behaviorSource, /disabled=\{disabled\.multiturnUnlimited\}/);
});
