declare module 'dns-packet' {
  const AUTHORITATIVE_ANSWER: number
  const TRUNCATED_RESPONSE: number
  const RECURSION_DESIRED: number
  const RECURSION_AVAILABLE: number
  const AUTHENTIC_DATA: number
  const CHECKING_DISABLED: number
  const DNSSEC_OK: number

  interface decoder<T> {
    (buf: Buffer, offset?: number): T
    bytes: number
  }

  const decode: decoder<Packet>

  interface encoder<T> {
    (packet: T, buf?: Buffer, offset?: number): Buffer
    bytes: number
  }

  const encode: encoder<Packet>

  interface Packet {
    id?: number
    type: 'query' | 'response'
    flags?: number
    rcode?: string
    questions: Question[]
    answers?: Answer[]
    authorities?: Answer[]
    additionals?: Answer[]
  }

  interface Question {
    type: string
    class: string
    name: string
  }

  interface AnswerBase {
    type: string
    class?: string
    name: string
    ttl?: number
    flush?: boolean
  }

  interface A extends AnswerBase {
    type: 'A'
    data: string
  }

  interface Dnskey extends AnswerBase {
    type: 'DNSKEY'
    data: {
      flags: number
      algorithm: number
      key: Buffer
    }
  }

  interface Ds extends AnswerBase {
    type: 'DS'
    data: {
      keyTag: number
      algorithm: number
      digestType: number
      digest: Buffer
    }
  }

  interface Opt extends AnswerBase {
    type: 'OPT'
    udpPayloadSize?: number
    extendedRcode?: number
    ednsVersion?: number
    flags?: number
    data?: any
  }

  interface Rrsig extends AnswerBase {
    type: 'RRSIG'
    data: {
      typeCovered: string
      algorithm: number
      labels: number
      originalTTL: number
      expiration: number
      inception: number
      keyTag: number
      signersName: string
      signature: Buffer
    }
  }

  interface Rtxt extends AnswerBase {
    type: 'TXT'
    data: Buffer[]
  }

  type Answer = A | Dnskey | Ds | Opt | Rrsig | Rtxt

  interface Encodable<T> {
    decode: decoder<T>
    encode: encoder<T>
  }

  const record: (type: string) => Encodable<Answer>
  const answer: Encodable<Answer>
  const dnskey: Encodable<Dnskey['data']>
  const name: Encodable<string>
  const rrsig: Encodable<Rrsig['data']>
}

declare module 'dns-packet/types' {
  function toString(type: number): string
}
