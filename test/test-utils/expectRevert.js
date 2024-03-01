const Web3 = require('web3')
const { expect } = require('chai')

const DEFAULT_PROVIDER_URL = 'http://localhost:8545'

const localWeb3 = new Web3()

function setWeb3Provider(provider) {
  localWeb3.setProvider(provider)
}

function setDefaultWeb3Provider() {
  if (typeof web3 !== 'undefined') {
    setWeb3Provider(web3.currentProvider)
  } else {
    setWeb3Provider(DEFAULT_PROVIDER_URL)
  }
}

function getWeb3() {
  if (localWeb3.currentProvider === null) {
    throw new Error('web3 provider is not configured')
  }
  return localWeb3
}

setWeb3Provider.default = setDefaultWeb3Provider

let configLoaded = false

function configure(config) {
  if (!config) {
    if (!configLoaded) {
      defaultConfigure()
      configLoaded = true
    }
  } else {
    customConfigure(config)
    configLoaded = true
  }
}

function defaultConfigure() {
  setDefaultWeb3Provider()
}

function customConfigure(config) {
  defaultConfigure()

  if ('provider' in config) {
    setWeb3Provider(config.provider)
  }
}

async function expectException(promise, expectedError) {
  try {
    await promise
  } catch (error) {
    const actualError = error.message.replace(
      /Returned error: VM Exception while processing transaction: (revert )?/,
      '',
    )
    expect(actualError).to.equal(
      expectedError,
      'Wrong kind of exception received',
    )
    return
  }
  expect.fail('Expected an exception but none was received')
}

const expectRevert = async function (promise, expectedError) {
  promise.catch(() => {})
  if (!expectedError) {
    throw Error(
      "No revert reason specified: call expectRevert with the reason string, or use expectRevert.unspecified if your 'require' statement doesn't have one.",
    )
  }
  await expectException(promise, expectedError)
}

expectRevert.unspecified = (promise) => expectException(promise, 'revert')

module.exports = {
  setWeb3Provider,
  getWeb3,
  configure,
  expectRevert,
}
