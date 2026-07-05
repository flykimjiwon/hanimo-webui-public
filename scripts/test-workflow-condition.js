const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadConditionModule() {
  const modulePath = path.join(__dirname, '..', 'app', 'lib', 'workflow-condition.mjs');
  return import(pathToFileURL(modulePath).href);
}

async function main() {
  const { evaluateConditionExpression, evaluateStructuredCondition } =
    await loadConditionModule();

  assert.equal(
    evaluateStructuredCondition('hello hanimo', 'contains', 'hanimo'),
    true,
    'Given a contains operator, When text includes the comparison value, Then condition passes'
  );
  assert.equal(
    evaluateStructuredCondition('42', 'greater_than', '7'),
    true,
    'Given numeric strings, When greater_than compares them, Then numeric comparison is used'
  );
  assert.equal(
    evaluateStructuredCondition('', 'is_empty'),
    true,
    'Given empty input, When is_empty is evaluated, Then condition passes'
  );
  assert.equal(
    evaluateConditionExpression('score >= 70 && status === "approved"', {
      score: 85,
      status: 'approved',
    }),
    true,
    'Given variables, When a safe boolean expression is evaluated, Then it returns the expected result'
  );
  assert.equal(
    evaluateConditionExpression('(score < 70) || status !== "approved"', {
      score: 85,
      status: 'approved',
    }),
    false,
    'Given variables, When grouped logical operators are evaluated, Then precedence is preserved'
  );
  assert.equal(
    evaluateConditionExpression('enabled && score > 70', {
      enabled: false,
      score: 85,
    }),
    false,
    'Given a false left operand, When && is evaluated, Then the parser still consumes the right expression'
  );

  let executed = false;
  const originalExit = process.exit;
  process.exit = () => {
    executed = true;
    throw new Error('process.exit should not be callable from conditions');
  };
  try {
    assert.throws(
      () => evaluateConditionExpression('process.exit(1) || true', {}),
      /Unexpected token|Unsupported token|Expected/,
      'Given a function call payload, When condition evaluation runs, Then it is rejected'
    );
  } finally {
    process.exit = originalExit;
  }
  assert.equal(executed, false, 'Then the malicious payload is not executed');

  console.log('workflow condition tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
