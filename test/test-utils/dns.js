var packet = require('dns-packet')

function hexEncodeName(name) {
  return '0x' + packet.name.encode(name).toString('hex')
}

function hexEncodeTXT(keys) {
  return '0x' + packet.answer.encode(keys).toString('hex')
}
// resolves to a hexadecimal address from a name

function nameToHex(name) {
  // strip leading and trailing .
  const n = name.replace(/^\.|\.$/gm, '')

  var bufLen = n === '' ? 1 : n.length + 2
  var buf = Buffer.allocUnsafe(bufLen)

  offset = 0
  if (n.length) {
    const list = n.split('.')
    for (let i = 0; i < list.length; i++) {
      const len = buf.write(list[i], offset + 1)
      buf[offset] = len
      offset += len + 1
    }
  }
  buf[offset++] = 0
  return (
    '0x' +
    buf.reduce(
      (output, elem) => output + ('0' + elem.toString(16)).slice(-2),
      '',
    )
  )
}

module.exports = {
  hexEncodeName: hexEncodeName,
  hexEncodeTXT: hexEncodeTXT,
  nameToHex: nameToHex,
}
