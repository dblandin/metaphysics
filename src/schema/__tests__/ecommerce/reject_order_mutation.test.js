/* eslint-disable promise/always-return */
import { runQuery } from "test/utils"
import { mockxchange } from "test/fixtures/exchange/mockxchange"
import sampleOrder from "test/fixtures/results/sample_order"
import exchangeOrderJSON from "test/fixtures/exchange/order.json"

let rootValue

describe("Reject Order Mutation", () => {
  beforeEach(() => {
    const resolvers = {
      Mutation: {
        rejectOrder: () => ({
          order: exchangeOrderJSON,
          errors: [],
        }),
      },
    }
    rootValue = mockxchange(resolvers)
  })
  it("rejects order and return it", () => {
    const mutation = `
      mutation {
        rejectOrder(input: {
            orderId: "111",
          }) {
            result {
              order {
                id
                code
                currencyCode
                state
                fulfillmentType
                shippingName
                shippingAddressLine1
                shippingAddressLine2
                shippingCity
                shippingCountry
                shippingPostalCode
                shippingRegion
                itemsTotalCents
                shippingTotalCents
                taxTotalCents
                commissionFeeCents
                transactionFeeCents
                buyerTotalCents
                sellerTotalCents
                itemsTotal
                shippingTotal
                taxTotal
                commissionFee
                transactionFee
                buyerTotal
                sellerTotal
                updatedAt
                createdAt
                stateUpdatedAt
                stateExpiresAt
                partner {
                  id
                  name
                }
                user {
                  id
                  email
                }
                lineItems {
                  edges {
                    node {
                      artwork {
                        id
                        title
                        inventoryId
                      }
                    }
                  }
                }
              }
            errors
            }
          }
        }
    `

    return runQuery(mutation, rootValue).then(data => {
      expect(data.rejectOrder.result.order).toEqual(sampleOrder(true, false))
    })
  })
})
