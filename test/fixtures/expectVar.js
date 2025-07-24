// expectVar({ x }) <==> expect(x, 'x')
export function expectVar(obj) {
  const [[k, v]] = Object.entries(obj)
  return expect(v, k)
}
