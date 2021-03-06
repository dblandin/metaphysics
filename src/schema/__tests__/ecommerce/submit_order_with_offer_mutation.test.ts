/* eslint-disable promise/always-return */
import { runQuery } from "test/utils"
import { mockxchange } from "test/fixtures/exchange/mockxchange"
import { sampleOrder } from "test/fixtures/results/sample_order"
import exchangeOrderJSON from "test/fixtures/exchange/order.json"
import gql from "lib/gql"
import { OrderBuyerFields } from "./order_fields"
let rootValue
describe("Submit Order With Offer Mutation", () => {
  const mutation = gql`
    mutation {
      ecommerceSubmitOrderWithOffer(
        input: { offerId: "1111" }
      ) {
        orderOrError {
          ... on OrderWithMutationSuccess {
            order{
              ${OrderBuyerFields}
            }
          }
          ... on OrderWithMutationFailure {
            error {
              type
              code
              data
            }
          }
        }
      }
    }
  `
  it("Submits order with offer and returns it", () => {
    const resolvers = {
      Mutation: {
        submitOrderWithOffer: () => ({
          orderOrError: { order: exchangeOrderJSON },
        }),
      },
    }
    rootValue = mockxchange(resolvers)
    return runQuery(mutation, rootValue).then(data => {
      expect(data!.ecommerceSubmitOrderWithOffer.orderOrError.order).toEqual(
        sampleOrder()
      )
    })
  })
  it("returns an error if there is one", () => {
    const resolvers = {
      Mutation: {
        submitOrderWithOffer: () => ({
          orderOrError: {
            error: {
              type: "application_error",
              code: "404",
            },
          },
        }),
      },
    }
    rootValue = mockxchange(resolvers)
    return runQuery(mutation, rootValue).then(data => {
      expect(data!.ecommerceSubmitOrderWithOffer.orderOrError.error).toEqual({
        type: "application_error",
        code: "404",
        data: null,
      })
    })
  })
})
