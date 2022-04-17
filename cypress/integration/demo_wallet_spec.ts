const bitcoinAssetId = 'bip122:000000000019d6689c085ae165831e93/slip44:0'

describe('Using a Demo wallet, mate!', () => {
  const baseUrl = Cypress.config().baseUrl
  before(() => {
    cy.clearIndexedDB()
  })

  it('Demo wallet', () => {
    cy.visit('')
    // Click 'Try without wallet' button
    cy.getBySel('connect-demo-wallet-button').click()
    cy.url().should('equal', `${baseUrl}assets/${bitcoinAssetId}`)
    // The assets nav button is active
    cy.getBySel('navbar-assets-button').should('exist').and('have.attr', 'data-active')
    // The account page link in the nav page should be hidden
    cy.getBySel('navbar-accounts-button').should('not.exist')
    // The send and receive buttons are disabled
    cy.getBySel('asset-action-send').should('be.disabled')
    cy.getBySel('asset-action-receive').should('be.disabled')
  })
})
