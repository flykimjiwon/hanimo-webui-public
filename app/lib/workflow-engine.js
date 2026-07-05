/**
 * Workflow execution engine
 * DAG-based topological sort + per-node execution
 */

import { getNextModelServerEndpointWithIndex } from '@/lib/modelServers';
import { executeWorkflowConditionNode } from './workflow-condition.mjs';

/**
 * Build OpenAI-compatible API URL (prevent /v1 duplication)
 */
function buildApiUrl(base) {
  if (!base) return null;
  if (/\/v1(\/|$)/.test(base)) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

export class WorkflowEngine {
  constructor(definition, options = {}) {
    this.nodes = definition.nodes || [];
    this.edges = definition.edges || [];
    this.variables = {}; // data passing between nodes
    this.nodeStates = {};
    this.logs = [];
    this.totalTokens = 0;
    this.options = options; // { customEndpoints, userId, onNodeStart, onNodeComplete, onNodeError, ... }
  }

  /**
   * Topological sort (Kahn's algorithm)
   * Throws error if cycle detected
   */
  topologicalSort() {
    const inDegree = {};
    const adj = {};

    for (const node of this.nodes) {
      inDegree[node.id] = 0;
      adj[node.id] = [];
    }

    for (const edge of this.edges) {
      adj[edge.source] = adj[edge.source] || [];
      adj[edge.source].push(edge.target);
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    }

    const queue = [];
    for (const node of this.nodes) {
      if (inDegree[node.id] === 0) {
        queue.push(node.id);
      }
    }

    const sorted = [];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      sorted.push(nodeId);

      for (const neighbor of (adj[nodeId] || [])) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (sorted.length !== this.nodes.length) {
      throw new Error('워크플로우에 순환(cycle)이 감지되었습니다.');
    }

    return sorted.map((id) => this.nodes.find((n) => n.id === id));
  }

  /**
   * Mark target nodes of inactive branch ports as skipped
   * @param {string} sourceNodeId - branching node ID
   * @param {string[]} activePorts - active port names
   * @param {Set} skippedNodes - Set of node IDs to skip (mutated)
   */
  markInactiveBranchNodes(sourceNodeId, activePorts, skippedNodes) {
    for (const edge of this.edges) {
      if (edge.source !== sourceNodeId) continue;

      const handle = edge.sourceHandle || 'default';
      if (!activePorts.includes(handle)) {
        skippedNodes.add(edge.target);
        this.addLog(
          sourceNodeId,
          `비활성 분기 노드 스킵: ${edge.target} (포트: ${handle})`
        );
      }
    }
  }

  /**
   * Recursively add nodes where all input edges are from skipped nodes
   * @param {Set} skippedNodes
   */
  propagateSkipped(skippedNodes) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of this.nodes) {
        if (skippedNodes.has(node.id)) continue;
        const inputEdges = this.getInputEdges(node.id);
        if (
          inputEdges.length > 0 &&
          inputEdges.every((e) => skippedNodes.has(e.source))
        ) {
          skippedNodes.add(node.id);
          changed = true;
        }
      }
    }
  }

  /**
   * Execute the full workflow
   * @param {object} inputs - input values (input node variable name → value)
   */
  async run(inputs = {}) {
    const startTime = Date.now();

    // 1. Assign inputs to input node variables
    for (const [key, value] of Object.entries(inputs)) {
      this.variables[key] = value;
    }

    // 2. Topological sort
    const sortedNodes = this.topologicalSort();

    const skippedNodes = new Set();

    // 3. Execute each node in order
    for (const node of sortedNodes) {
      if (skippedNodes.has(node.id)) {
        this.addLog(node.id, `노드 스킵 (비활성 분기): ${node.type} (${node.id})`);
        this.nodeStates[node.id] = { status: 'skipped' };
        continue;
      }

      this.addLog(node.id, `노드 실행 시작: ${node.type} (${node.id})`);
      this.nodeStates[node.id] = { status: 'running' };

      // SSE callback: node start
      this.options.onNodeStart?.(node.id, node.data?.label || node.type);

      try {
        const output = await this.executeNode(node, skippedNodes);
        this.addLog(node.id, `노드 실행 완료: ${node.type}`);

        // SSE callback: node complete
        this.options.onNodeComplete?.(
          node.id,
          node.data?.label || node.type,
          output
        );
      } catch (err) {
        this.nodeStates[node.id] = { status: 'failed', error: err.message };
        this.addLog(node.id, `노드 실행 실패: ${err.message}`, 'error');

        // SSE callback: node error
        this.options.onNodeError?.(node.id, err.message);

        throw err;
      }

      // Propagate skips after branch nodes
      if (node.type === 'condition' || node.type === 'switch') {
        this.propagateSkipped(skippedNodes);
      }
    }

    // 4. Collect results from output nodes
    const outputs = {};
    for (const node of this.nodes) {
      if (node.type === 'output') {
        const val = this.variables[node.id];
        const label = node.data?.label || node.id;
        outputs[label] = val;
      }
    }

    // 5. Return results
    return {
      status: 'completed',
      outputs,
      nodeStates: this.nodeStates,
      totalTokens: this.totalTokens,
      executionTime: Date.now() - startTime,
      logs: this.logs,
    };
  }

  /**
   * Branch execution by node type
   * @param {object} node
   * @param {Set} skippedNodes
   */
  async executeNode(node, skippedNodes = new Set()) {
    switch (node.type) {
      case 'input':
        return this.executeInputNode(node);
      case 'output':
        return this.executeOutputNode(node);
      case 'llm-chat':
        return this.executeLLMChatNode(node);
      case 'template':
        return this.executeTemplateNode(node);
      case 'condition':
        return this.executeConditionNode(node, skippedNodes);
      case 'switch':
        return this.executeSwitchNode(node, skippedNodes);
      case 'loop':
        return this.executeLoopNode(node);
      case 'merge':
        return this.executeMergeNode(node);
      case 'json-transform':
        return this.executeJsonTransformNode(node);
      case 'text-split':
        return this.executeTextSplitNode(node);
      case 'text-join':
        return this.executeTextJoinNode(node);
      default:
        this.addLog(node.id, `알 수 없는 노드 타입: ${node.type}`, 'warn');
        this.setNodeOutput(node.id, null);
        return null;
    }
  }

  /**
   * Input node: store input value in variables
   */
  executeInputNode(node) {
    const varName = node.data?.variableName || node.data?.label || node.id;
    const value = this.variables[varName] ?? node.data?.defaultValue ?? '';
    this.variables[varName] = value;
    this.setNodeOutput(node.id, value);
    return value;
  }

  /**
   * Output node: collect values from connected input edges
   */
  executeOutputNode(node) {
    const inputEdges = this.getInputEdges(node.id);
    let value;
    if (inputEdges.length === 1) {
      value = this.variables[inputEdges[0].source];
    } else if (inputEdges.length > 1) {
      value = {};
      for (const edge of inputEdges) {
        value[edge.source] = this.variables[edge.source];
      }
    } else {
      value = node.data?.value ?? '';
    }
    this.setNodeOutput(node.id, value);
    return value;
  }

  /**
   * LLM Chat node: call model server
   * node.data: { modelSource, modelId, customEndpointId, systemPrompt, promptTemplate, temperature, maxTokens }
   */
  async executeLLMChatNode(node) {
    const data = node.data || {};
    const {
      modelSource = 'site',
      modelId,
      customEndpointId,
      systemPrompt = '',
      promptTemplate = '',
      temperature = 0.7,
      maxTokens = 2048,
    } = data;

    const userPrompt = this.resolveTemplate(promptTemplate);
    const resolvedSystemPrompt = this.resolveTemplate(systemPrompt);

    let endpointUrl;
    let apiKey = '';
    let actualModelId = modelId;

    if (modelSource === 'custom' && customEndpointId) {
      const customEndpoints = this.options.customEndpoints || [];
      const ep = customEndpoints.find(
        (e) => String(e.id) === String(customEndpointId)
      );
      if (!ep) {
        throw new Error(
          `커스텀 엔드포인트를 찾을 수 없습니다: ${customEndpointId}`
        );
      }
      endpointUrl = ep.endpoint_url || ep.url;
      apiKey = ep.api_key || '';
      actualModelId = ep.model_name || modelId;
    } else {
      const epInfo = await getNextModelServerEndpointWithIndex();
      if (!epInfo || !epInfo.endpoint) {
        throw new Error(
          '사용 가능한 모델 서버가 없습니다. 관리자 설정에서 모델 서버를 등록해 주세요.'
        );
      }
      endpointUrl = epInfo.endpoint;
      apiKey = epInfo.apiKey || '';
    }

    const apiUrl = buildApiUrl(endpointUrl);

    const messages = [];
    if (resolvedSystemPrompt) {
      messages.push({ role: 'system', content: resolvedSystemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = {
      model: actualModelId,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };

    // 3-attempt retry with exponential backoff
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(
            `LLM 서버 오류 (${response.status}): ${errText}`
          );
        }

        const result = await response.json();

        const content = result?.choices?.[0]?.message?.content ?? '';

        if (result?.usage?.total_tokens) {
          this.totalTokens += result.usage.total_tokens;
        }

        this.addLog(
          node.id,
          `LLM 응답 수신 (tokens: ${result?.usage?.total_tokens ?? 0})`
        );
        this.setNodeOutput(node.id, content);
        return content;
      } catch (err) {
        lastError = err;
        this.addLog(
          node.id,
          `LLM 호출 실패 (시도 ${attempt + 1}/3): ${err.message}`,
          'warn'
        );
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }

    throw new Error(`LLM 호출 실패 (3회 시도): ${lastError?.message}`);
  }

  /**
   * Template node: replace {{variable}} and output
   */
  executeTemplateNode(node) {
    const template = node.data?.template || '';
    const result = this.resolveTemplate(template);
    this.setNodeOutput(node.id, result);
    return result;
  }

  /**
   * Condition node: evaluate condition and branch true/false
   * @param {object} node
   * @param {Set} skippedNodes
   */
  executeConditionNode(node, skippedNodes) {
    return executeWorkflowConditionNode(this, node, skippedNodes);
  }

  /**
   * Switch node: multi-branch based on variable value
   * @param {object} node
   * @param {Set} skippedNodes
   */
  executeSwitchNode(node, skippedNodes) {
    const { variableName, cases = [], defaultPort = 'default' } = node.data || {};

    const varValue = String(this.getVariable(variableName) ?? '');

    const matched = cases.find((c) => String(c.value) === varValue);
    const activePort = matched ? matched.outputPort : defaultPort;

    this.addLog(
      node.id,
      `Switch 평가: 변수 '${variableName}' = '${varValue}', 활성 포트: '${activePort}'`
    );

    this.setNodeOutput(node.id, varValue);

    if (skippedNodes) {
      this.markInactiveBranchNodes(node.id, [activePort], skippedNodes);
    }

    return varValue;
  }

  /**
   * Loop node: iterate over array
   * node.data: { arrayVariable, itemVariable, maxIterations: 100 }
   */
  async executeLoopNode(node) {
    const {
      arrayVariable,
      itemVariable = 'item',
      maxIterations = 100,
    } = node.data || {};

    let arr = this.getVariable(arrayVariable);
    if (!Array.isArray(arr)) {
      if (typeof arr === 'string') {
        try {
          arr = JSON.parse(arr);
        } catch {
          arr = [];
        }
      } else {
        arr = [];
      }
    }

    if (arr.length > maxIterations) {
      throw new Error(
        `루프 최대 반복 횟수(${maxIterations})를 초과했습니다. 배열 길이: ${arr.length}`
      );
    }

    this.addLog(node.id, `루프 시작: ${arr.length}개 항목`);

    const loopBodyEdges = this.edges.filter((e) => e.source === node.id);
    const loopBodyNodeIds = loopBodyEdges.map((e) => e.target);

    const results = [];

    for (let i = 0; i < arr.length; i++) {
      const currentItem = arr[i];
      this.variables[itemVariable] = currentItem;
      this.variables[`${itemVariable}_index`] = i;

      this.addLog(node.id, `루프 반복 ${i + 1}/${arr.length}: ${JSON.stringify(currentItem)}`);

      for (const bodyNodeId of loopBodyNodeIds) {
        const bodyNode = this.nodes.find((n) => n.id === bodyNodeId);
        if (bodyNode) {
          await this.executeNode(bodyNode);
        }
      }

      if (loopBodyNodeIds.length > 0) {
        const lastNodeId = loopBodyNodeIds[loopBodyNodeIds.length - 1];
        results.push(this.variables[lastNodeId]);
      } else {
        results.push(currentItem);
      }
    }

    this.addLog(node.id, `루프 완료: ${results.length}개 결과`);
    this.setNodeOutput(node.id, results);
    return results;
  }

  /**
   * Merge node: combine multiple branch results
   * node.data: { strategy: 'concat' | 'object' | 'first' }
   */
  executeMergeNode(node) {
    const strategy = node.data?.strategy || 'concat';
    const inputEdges = this.getInputEdges(node.id);

    const values = inputEdges
      .map((e) => this.variables[e.source])
      .filter((v) => v != null);

    let result;

    switch (strategy) {
      case 'concat':
        result = values.reduce((acc, v) => {
          if (Array.isArray(v)) return acc.concat(v);
          acc.push(v);
          return acc;
        }, []);
        break;

      case 'object':
        result = {};
        for (const edge of inputEdges) {
          const val = this.variables[edge.source];
          if (val != null) {
            result[edge.source] = val;
          }
        }
        break;

      case 'first':
        result = values[0] ?? null;
        break;

      default:
        result = values;
    }

    this.addLog(node.id, `Merge 완료 (strategy: ${strategy}): ${inputEdges.length}개 입력`);
    this.setNodeOutput(node.id, result);
    return result;
  }

  /**
   * JSON Transform node: process JSON data
   * node.data: { inputVariable, extractPath, transformType: 'extract' | 'filter' | 'map' }
   */
  executeJsonTransformNode(node) {
    const {
      inputVariable,
      extractPath = '',
      transformType = 'extract',
      filterField,
      filterValue,
      mapField,
    } = node.data || {};

    let input = this.getVariable(inputVariable);

    if (typeof input === 'string') {
      try {
        input = JSON.parse(input);
      } catch {
        // keep original on parse failure
      }
    }

    let result;

    switch (transformType) {
      case 'extract': {
        if (!extractPath) {
          result = input;
        } else {
          result = this.getNestedValue(input, extractPath);
        }
        break;
      }

      case 'filter': {
        if (!Array.isArray(input)) {
          this.addLog(node.id, '필터 대상이 배열이 아닙니다', 'warn');
          result = [];
        } else {
          result = input.filter((item) => {
            if (filterField && filterValue !== undefined) {
              return String(item?.[filterField]) === String(filterValue);
            }
            return Boolean(item);
          });
        }
        break;
      }

      case 'map': {
        if (!Array.isArray(input)) {
          this.addLog(node.id, 'Map 대상이 배열이 아닙니다', 'warn');
          result = [];
        } else if (mapField) {
          result = input.map((item) => item?.[mapField]);
        } else {
          result = input;
        }
        break;
      }

      default:
        result = input;
    }

    this.addLog(node.id, `JSON Transform 완료 (type: ${transformType})`);
    this.setNodeOutput(node.id, result);
    return result;
  }

  /**
   * Text Split node: split text into array
   * node.data: { inputVariable, delimiter: '\n' }
   */
  executeTextSplitNode(node) {
    const { inputVariable, delimiter = '\n' } = node.data || {};

    const text = String(this.getVariable(inputVariable) ?? '');
    const actualDelimiter = delimiter
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r');

    const result = actualDelimiter
      ? text.split(actualDelimiter)
      : text.split('');

    const filtered = result.filter((s) => s.trim() !== '');

    this.addLog(node.id, `텍스트 분리 완료: ${filtered.length}개 항목`);
    this.setNodeOutput(node.id, filtered);
    return filtered;
  }

  /**
   * Text Join node: join array into text
   * node.data: { inputVariable, delimiter: '\n' }
   */
  executeTextJoinNode(node) {
    const { inputVariable, delimiter = '\n' } = node.data || {};

    let arr = this.getVariable(inputVariable);

    if (!Array.isArray(arr)) {
      if (typeof arr === 'string') {
        try {
          arr = JSON.parse(arr);
        } catch {
          arr = [arr];
        }
      } else if (arr != null) {
        arr = [arr];
      } else {
        arr = [];
      }
    }

    const actualDelimiter = delimiter
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r');

    const result = arr.map((v) => String(v ?? '')).join(actualDelimiter);

    this.addLog(node.id, `텍스트 합치기 완료: ${arr.length}개 → 문자열`);
    this.setNodeOutput(node.id, result);
    return result;
  }

  /**
   * Template resolution helper: replace {{varName}} or {{a.b.c}}
   */
  resolveTemplate(template) {
    if (!template) return '';
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
      const val = this.getVariable(key);
      return val != null ? String(val) : '';
    });
  }

  /**
   * Variable access helper (supports dot notation)
   */
  getVariable(path) {
    if (!path) return undefined;
    const parts = path.split('.');
    let current = this.variables;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Extract value from nested object using dot notation
   */
  getNestedValue(obj, path) {
    if (!path) return obj;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Find input edges for a specific node
   */
  getInputEdges(nodeId) {
    return this.edges.filter((e) => e.target === nodeId);
  }

  /**
   * Store node output in variables and nodeStates
   */
  setNodeOutput(nodeId, value) {
    this.variables[nodeId] = value;
    this.nodeStates[nodeId] = { status: 'completed', output: value };
  }

  /**
   * Add execution log entry
   */
  addLog(nodeId, message, level = 'info') {
    this.logs.push({
      nodeId,
      message,
      level,
      timestamp: new Date().toISOString(),
    });
  }
}
