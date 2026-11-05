export function parseNumericExpression(input: string): number | null {
  const source = input.replace(/\s+/g, '').replace(/[xX×]/g, '*').replace(/÷/g, '/');
  if (!source || source.length > 100) return null;
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g);
  if (!tokens || tokens.join('') !== source) return null;
  let index = 0;
  const factor = (): number => {
    const token = tokens[index++];
    if (token === '+') return factor();
    if (token === '-') return -factor();
    if (token === '(') { const value = expression(); if (tokens[index++] !== ')') return NaN; return value; }
    return token !== undefined && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) ? Number(token) : NaN;
  };
  const term = (): number => { let value = factor(); while (tokens[index] === '*' || tokens[index] === '/') { const operator = tokens[index++], right = factor(); value = operator === '*' ? value * right : value / right; } return value; };
  const expression = (): number => { let value = term(); while (tokens[index] === '+' || tokens[index] === '-') { const operator = tokens[index++], right = term(); value = operator === '+' ? value + right : value - right; } return value; };
  const value = expression();
  return index === tokens.length && Number.isFinite(value) ? value : null;
}
