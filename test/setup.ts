// Setup file for vitest tests
import '@ensdomains/hardhat-chai-matchers-viem'

// Since the package doesn't export the matchers directly and relies on Hardhat hooks,
// manually initialized the chai matchers for vitest

async function setupChaiMatchers() {
  try {
    const { hardhatChaiMatchers } = await import(
      /* @vite-ignore */
      '../node_modules/@ensdomains/hardhat-chai-matchers-viem/dist/matchers.js'
    )
    // Use the global chai from vitest
    chai.use(hardhatChaiMatchers)
  } catch (error) {
    console.error('Failed to load chai matchers:', error)
  }
}

await setupChaiMatchers()
