const TOKEN_TYPES = { boolean: 'boolean', eof: 'eof', identifier: 'identifier', null: 'null', number: 'number', operator: 'operator', string: 'string' };

const OPERATOR_TOKENS = ['===', '!==', '>=', '<=', '&&', '||', '==', '!=', '>', '<', '!', '(', ')'];
const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;

class ConditionSyntaxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConditionSyntaxError';
  }
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const operator = OPERATOR_TOKENS.find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      tokens.push({ type: TOKEN_TYPES.operator, value: operator });
      index += operator.length;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') {
          index += 1;
          if (index >= source.length) throw new ConditionSyntaxError('Invalid string escape.');
        }
        value += source[index];
        index += 1;
      }
      if (source[index] !== quote) throw new ConditionSyntaxError('Unterminated string literal.');
      tokens.push({ type: TOKEN_TYPES.string, value });
      index += 1;
      continue;
    }

    const numberMatch = source.slice(index).match(/^-?\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push({ type: TOKEN_TYPES.number, value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$.]*/);
    if (identifierMatch) {
      const value = identifierMatch[0];
      if (value === 'true' || value === 'false') {
        tokens.push({ type: TOKEN_TYPES.boolean, value: value === 'true' });
      } else if (value === 'null') {
        tokens.push({ type: TOKEN_TYPES.null, value: null });
      } else {
        tokens.push({ type: TOKEN_TYPES.identifier, value });
      }
      index += value.length;
      continue;
    }

    throw new ConditionSyntaxError(`Unsupported token '${char}'.`);
  }

  tokens.push({ type: TOKEN_TYPES.eof, value: '' });
  return tokens;
}

function getPathValue(values, path) {
  if (!path) return undefined;
  return path.split('.').reduce((current, part) => {
    if (current == null || typeof current !== 'object') return undefined;
    return current[part];
  }, values);
}

function normalizeComparable(value) {
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  const text = String(value);
  return NUMERIC_PATTERN.test(text) ? Number(text) : text;
}

function looselyEqual(left, right) {
  const leftValue = normalizeComparable(left);
  const rightValue = normalizeComparable(right);
  if (leftValue == null || rightValue == null) return leftValue == null && rightValue == null;
  return Object.is(leftValue, rightValue) || String(leftValue) === String(rightValue);
}

function compare(left, right, operator) {
  switch (operator) {
    case '===':
      return Object.is(left, right);
    case '!==':
      return !Object.is(left, right);
    case '==':
      return looselyEqual(left, right);
    case '!=':
      return !looselyEqual(left, right);
    case '>':
      return normalizeComparable(left) > normalizeComparable(right);
    case '>=':
      return normalizeComparable(left) >= normalizeComparable(right);
    case '<':
      return normalizeComparable(left) < normalizeComparable(right);
    case '<=':
      return normalizeComparable(left) <= normalizeComparable(right);
    default:
      throw new ConditionSyntaxError(`Unsupported operator '${operator}'.`);
  }
}

class Parser {
  constructor(tokens, variables) {
    this.tokens = tokens;
    this.variables = variables;
    this.position = 0;
  }

  current() {
    return this.tokens[this.position];
  }

  match(value) {
    if (this.current().value !== value) return false;
    this.position += 1;
    return true;
  }

  expect(value) {
    if (!this.match(value)) throw new ConditionSyntaxError(`Expected '${value}'.`);
  }

  parse() {
    const result = this.parseOr();
    if (this.current().type !== TOKEN_TYPES.eof) {
      throw new ConditionSyntaxError(`Unexpected token '${this.current().value}'.`);
    }
    return Boolean(result);
  }

  parseOr() {
    let value = this.parseAnd();
    while (this.match('||')) {
      const right = this.parseAnd();
      value = Boolean(value) || Boolean(right);
    }
    return value;
  }

  parseAnd() {
    let value = this.parseEquality();
    while (this.match('&&')) {
      const right = this.parseEquality();
      value = Boolean(value) && Boolean(right);
    }
    return value;
  }

  parseEquality() {
    let value = this.parseUnary();
    while (['===', '!==', '==', '!=', '>', '>=', '<', '<='].includes(this.current().value)) {
      const operator = this.current().value;
      this.position += 1;
      value = compare(value, this.parseUnary(), operator);
    }
    return value;
  }

  parseUnary() {
    if (this.match('!')) return !Boolean(this.parseUnary());
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.current();
    this.position += 1;

    if (token.value === '(') {
      const value = this.parseOr();
      this.expect(')');
      return value;
    }
    if ([TOKEN_TYPES.boolean, TOKEN_TYPES.null, TOKEN_TYPES.number, TOKEN_TYPES.string].includes(token.type)) {
      return token.value;
    }
    if (token.type === TOKEN_TYPES.identifier) {
      const variable = getPathValue(this.variables, token.value);
      return variable === undefined ? token.value : variable;
    }

    throw new ConditionSyntaxError(`Unexpected token '${token.value}'.`);
  }
}

export function evaluateConditionExpression(expression, variables = {}) {
  const source = String(expression || '').trim();
  if (!source) return false;
  return new Parser(tokenize(source), variables).parse();
}

export function evaluateStructuredCondition(inputValue, operator = 'contains', compareValue = '') {
  const left = inputValue ?? '';
  const right = compareValue ?? '';

  switch (operator) {
    case 'contains':
      return String(left).includes(String(right));
    case 'equals':
      return looselyEqual(left, right);
    case 'not_equals':
      return !looselyEqual(left, right);
    case 'greater_than':
      return Number(left) > Number(right);
    case 'less_than':
      return Number(left) < Number(right);
    case 'regex': {
      const pattern = String(right).slice(0, 256);
      const target = String(left).slice(0, 4096);
      return new RegExp(pattern).test(target);
    }
    case 'is_empty':
      return String(left).trim() === '';
    case 'is_not_empty':
      return String(left).trim() !== '';
    default:
      throw new ConditionSyntaxError(`Unsupported condition operator '${operator}'.`);
  }
}

function resolveInputReference(engine, reference) {
  const input = String(reference || '').trim();
  const templateOnly = input.match(/^\{\{(\w+(?:\.\w+)*)\}\}$/);
  if (templateOnly) return engine.getVariable(templateOnly[1]);
  return engine.getVariable(input);
}

export function executeWorkflowConditionNode(engine, node, skippedNodes) {
  const condition = String(node.data?.condition || '');
  const inputVariable = String(node.data?.inputVariable || '');

  let result = false;
  try {
    if (condition.trim()) {
      result = evaluateConditionExpression(engine.resolveTemplate(condition), engine.variables);
    } else if (inputVariable.trim()) {
      result = evaluateStructuredCondition(
        resolveInputReference(engine, inputVariable),
        node.data?.operator,
        engine.resolveTemplate(node.data?.compareValue || '')
      );
    }
  } catch (err) {
    engine.addLog(
      node.id,
      `조건 평가 실패: ${err.message}, 기본값 false 사용`,
      'warn'
    );
  }

  const value = result
    ? (node.data?.trueValue ?? true)
    : (node.data?.falseValue ?? false);

  engine.setNodeOutput(node.id, value);
  engine.variables[`${node.id}_result`] = result;

  if (skippedNodes) {
    const activePort = result ? 'true' : 'false';
    engine.markInactiveBranchNodes(node.id, [activePort], skippedNodes);
  }

  return value;
}
