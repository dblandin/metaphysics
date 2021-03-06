import moment from "moment"
import { pageable } from "relay-cursor-paging"
import { connectionFromArraySlice, connectionFromArray } from "graphql-relay"
import {
  isExisty,
  exclude,
  existyValue,
  convertConnectionArgsToGravityArgs,
} from "lib/helpers"
import HTTPError from "lib/http_error"
import numeral from "./fields/numeral"
import { exhibitionPeriod, exhibitionStatus } from "lib/date"
import cached from "./fields/cached"
import date from "./fields/date"
import { markdown } from "./fields/markdown"
import Artist from "./artist"
import Partner from "./partner"
import ExternalPartner from "./external_partner"
import Fair from "./fair"
import Artwork, { artworkConnection } from "./artwork"
import Location from "./location"
import Image, { getDefault } from "./image"
import PartnerShowEventType from "./partner_show_event"
import { connectionWithCursorInfo } from "schema/fields/pagination"
import { GravityIDFields, NodeInterface } from "./object_identification"
import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLUnionType,
} from "graphql"
import { allViaLoader } from "../lib/all"
import { totalViaLoader } from "lib/total"
import { find } from "lodash"

import PartnerShowSorts from "./sorts/partner_show_sorts"
import EventStatus from "./input_fields/event_status"
import { LOCAL_DISCOVERY_RADIUS_KM } from "./city/constants"

const kind = ({ artists, fair, artists_without_artworks, group }) => {
  if (isExisty(fair)) return "fair"
  if (
    group ||
    artists.length > 1 ||
    (artists_without_artworks && artists_without_artworks.length > 1)
  ) {
    return "group"
  }
  if (
    artists.length === 1 ||
    (artists_without_artworks && artists_without_artworks.length === 1)
  ) {
    return "solo"
  }
}

const artworksArgs = {
  size: {
    type: GraphQLInt,
    description: "Number of artworks to return",
    defaultValue: 25,
  },
  published: {
    type: GraphQLBoolean,
    defaultValue: true,
  },
  page: {
    type: GraphQLInt,
    defaultValue: 1,
  },
  all: {
    type: GraphQLBoolean,
    default: false,
  },
  for_sale: {
    type: GraphQLBoolean,
    default: false,
  },
  exclude: {
    type: new GraphQLList(GraphQLString),
    description:
      "List of artwork IDs to exclude from the response (irrespective of size)",
  },
}

export const ShowType = new GraphQLObjectType({
  name: "Show",
  interfaces: [NodeInterface],
  fields: () => ({
    ...GravityIDFields,
    cached,
    artists: {
      description: "The Artists presenting in this show",
      type: new GraphQLList(Artist.type),
      resolve: ({ artists }) => artists,
    },
    artworks: {
      description: "The artworks featured in this show",
      deprecationReason: "Use artworks_connection instead",
      type: new GraphQLList(Artwork.type),
      args: artworksArgs,
      resolve: (
        show,
        options,
        _request,
        { rootValue: { partnerShowArtworksLoader } }
      ) => {
        let fetch

        if (options.all) {
          fetch = allViaLoader(
            partnerShowArtworksLoader,
            {
              partner_id: show.partner.id,
              show_id: show.id,
            },
            options
          )
        } else {
          fetch = partnerShowArtworksLoader(
            {
              partner_id: show.partner.id,
              show_id: show.id,
            },
            options
          ).then(({ body }) => body)
        }

        return fetch.then(exclude(options.exclude, "id"))
      },
    },
    artworks_connection: {
      description: "The artworks featured in the show",
      type: artworkConnection,
      args: pageable(artworksArgs),
      resolve: (
        show,
        options,
        _request,
        { rootValue: { partnerShowArtworksLoader } }
      ) => {
        const loaderOptions = {
          partner_id: show.partner.id,
          show_id: show.id,
        }
        const gravityOptions = convertConnectionArgsToGravityArgs(options)
        delete gravityOptions.page

        return Promise.all([
          totalViaLoader(
            partnerShowArtworksLoader,
            loaderOptions,
            Object.assign({}, gravityOptions, {
              size: 0,
            })
          ),
          partnerShowArtworksLoader(loaderOptions, gravityOptions),
        ]).then(([count, { body }]) => {
          return connectionFromArraySlice(body, options, {
            arrayLength: count,
            sliceStart: gravityOptions.offset,
          })
        })
      },
    },
    artists_without_artworks: {
      description: "Artists inside the show who do not have artworks present",
      type: new GraphQLList(Artist.type),
      resolve: ({ artists_without_artworks }) => artists_without_artworks,
    },
    city: {
      description:
        "The general city, derived from a fair location, a show location or a potential city",
      type: GraphQLString,
      resolve: ({ fair, location, partner_city }) => {
        if (fair && fair.location && fair.location.city) {
          return fair.location.city
        }
        if (location && isExisty(location.city)) {
          return location.city
        }
        return existyValue(partner_city)
      },
    },
    cover_image: {
      description: "The image you should use to represent this show",
      type: Image.type,
      resolve: (
        { id, partner, image_versions, image_url },
        _options,
        _request,
        { rootValue: { partnerShowArtworksLoader } }
      ) => {
        if (image_versions && image_versions.length && image_url) {
          return Image.resolve({
            image_versions,
            image_url,
          })
        }

        if (partner) {
          return partnerShowArtworksLoader(
            {
              partner_id: partner.id,
              show_id: id,
            },
            {
              size: 1,
              published: true,
            }
          ).then(({ body }) => {
            const artwork = body[0]
            return artwork && Image.resolve(getDefault(artwork.images))
          })
        }

        return null
      },
    },
    counts: {
      description:
        "An object that represents some of the numbers you might want to highlight",
      type: new GraphQLObjectType({
        name: "ShowCounts",
        fields: {
          artworks: {
            type: GraphQLInt,
            args: {
              artist_id: {
                type: GraphQLString,
                description: "The slug or ID of an artist in the show.",
              },
            },
            resolve: (
              { id, partner },
              options,
              _request,
              { rootValue: { partnerShowArtworksLoader } }
            ) => {
              return totalViaLoader(
                partnerShowArtworksLoader,
                {
                  partner_id: partner.id,
                  show_id: id,
                },
                options
              )
            },
          },
          eligible_artworks: numeral(
            ({ eligible_artworks_count }) => eligible_artworks_count
          ),
        },
      }),
      resolve: partner_show => partner_show,
    },
    description: {
      description: "A description of the show",
      type: GraphQLString,
    },
    displayable: {
      type: GraphQLBoolean,
      deprecationReason: "Prefix Boolean returning fields with `is_`",
    },

    end_at: date,
    events: {
      description: "Events from the partner that runs this show",
      type: new GraphQLList(PartnerShowEventType),
      resolve: (
        { partner, id },
        _options,
        _request,
        { rootValue: { partnerShowLoader } }
      ) =>
        partnerShowLoader({
          partner_id: partner.id,
          show_id: id,
        }).then(({ events }) => events),
    },
    exhibition_period: {
      type: GraphQLString,
      description: "A formatted description of the start to end dates",
      resolve: ({ start_at, end_at }) => exhibitionPeriod(start_at, end_at),
    },
    fair: {
      description: "If the show is in a Fair, then that fair",
      type: Fair.type,
      resolve: ({ fair }) => fair,
    },
    href: {
      description: "A path to the show on Artsy",
      type: GraphQLString,
      resolve: ({ id, is_reference, displayable }) => {
        if (is_reference || !displayable) return null
        return `/show/${id}`
      },
    },
    images: {
      description:
        "Images that represent the show, you may be interested in meta_image or cover_image for a definitive thumbnail",
      type: new GraphQLList(Image.type),
      args: {
        size: {
          type: GraphQLInt,
          description: "Number of images to return",
        },
        default: {
          type: GraphQLBoolean,
          description: "Pass true/false to include cover or not",
        },
        page: {
          type: GraphQLInt,
        },
      },
      resolve: (
        { id },
        options,
        _request,
        { rootValue: { partnerShowImagesLoader } }
      ) => {
        return partnerShowImagesLoader(id, options).then(Image.resolve)
      },
    },
    has_location: {
      type: GraphQLBoolean,
      description: "Flag showing if show has any location.",
      resolve: ({ location, fair, partner_city }) => {
        return isExisty(location || fair || partner_city)
      },
    },
    is_active: {
      type: GraphQLBoolean,
      description:
        "Gravity doesn’t expose the `active` flag. Temporarily re-state its logic.",
      resolve: ({ start_at, end_at }) => {
        const start = moment.utc(start_at).subtract(7, "days")
        const end = moment.utc(end_at).add(7, "days")
        return moment.utc().isBetween(start, end)
      },
    },
    is_displayable: {
      description: "Is this something we can display to the front-end?",
      type: GraphQLBoolean,
      resolve: ({ displayable }) => displayable,
    },
    is_fair_booth: {
      description: "Does the show exist as a fair booth?",
      type: GraphQLBoolean,
      resolve: ({ fair }) => isExisty(fair),
    },
    is_reference: {
      description: "Is it a stubbed show?",
      type: GraphQLBoolean,
      resolve: ({ is_reference }) => is_reference,
    },
    kind: {
      description: "Whether the show is in a fair, group or solo",
      type: GraphQLString,
      resolve: (
        show,
        _options,
        _request,
        { rootValue: { partnerShowLoader } }
      ) => {
        if (show.artists || show.artists_without_artworks) return kind(show)
        return partnerShowLoader({
          partner_id: show.partner.id,
          show_id: show.id,
        }).then(kind)
      },
    },
    location: {
      description: "Where the show is located (Could also be a fair location)",
      type: Location.type,
      resolve: ({ location, fair_location }) => location || fair_location,
    },
    meta_image: {
      description:
        "An image representing the show, or a sharable image from an artwork in the show",
      type: Image.type,
      resolve: (
        { id, partner, image_versions, image_url },
        _options,
        _request,
        { rootValue: { partnerShowArtworksLoader } }
      ) => {
        if (image_versions && image_versions.length && image_url) {
          return Image.resolve({
            image_versions,
            image_url,
          })
        }
        return partnerShowArtworksLoader(
          {
            partner_id: partner.id,
            show_id: id,
          },
          {
            published: true,
          }
        ).then(({ body }) => {
          return Image.resolve(
            getDefault(
              find(body, {
                can_share_image: true,
              })
            )
          )
        })
      },
    },
    name: {
      type: GraphQLString,
      description: "The exhibition title",
      resolve: ({ name }) => (isExisty(name) ? name.trim() : name),
    },
    nearbyShows: {
      description: "Shows that are near (~75km) from this show",
      type: showConnection,
      args: pageable({
        sort: PartnerShowSorts,
        status: EventStatus,
      }),
      resolve: async (
        show,
        args,
        _context,
        { rootValue: { showsWithHeadersLoader } }
      ) => {
        // Bail with an empty array if we can't get the lat/long for this show
        if (!show.location || !show.location.coordinates) {
          return connectionFromArray([], args)
        }

        const coordinates = show.location.coordinates
        const gravityOptions = {
          ...convertConnectionArgsToGravityArgs(args),
          displayable: true,
          near: `${coordinates.lat},${coordinates.lng}`,

          max_distance: LOCAL_DISCOVERY_RADIUS_KM,
          total_count: true,
        }
        delete gravityOptions.page

        const response = await showsWithHeadersLoader(gravityOptions)
        const { headers, body: cities } = response

        const results = connectionFromArraySlice(cities, args, {
          arrayLength: headers["x-total-count"],
          sliceStart: gravityOptions.offset,
        })

        // This is in our schema, so might as well fill it
        // @ts-ignore
        results.totalCount = headers["x-total-count"]
        return results
      },
    },
    partner: {
      description:
        "The partner that represents this show, could be a non-Artsy partner",
      type: new GraphQLUnionType({
        name: "PartnerTypes",
        types: [Partner.type, ExternalPartner.type],
        resolveType: value => {
          if (value._links) {
            return ExternalPartner.type
          }
          return Partner.type
        },
      }),
      resolve: (
        { partner, galaxy_partner_id },
        _options,
        _request,
        { rootValue: { galaxyGalleriesLoader } }
      ) => {
        if (partner) {
          return partner
        }
        if (galaxy_partner_id) {
          return galaxyGalleriesLoader(galaxy_partner_id)
        }
      },
    },
    press_release: {
      description: "The press release for this show",
      ...markdown(),
    },
    start_at: {
      description: "When this show starts",
      ...date,
    },
    status: {
      description: "Is this show running, upcoming or closed?",
      type: GraphQLString,
    },
    status_update: {
      type: GraphQLString,
      description: "A formatted update on upcoming status changes",
      args: {
        max_days: {
          type: GraphQLInt,
          description: "Before this many days no update will be generated",
        },
      },
      resolve: ({ start_at, end_at }, options) =>
        exhibitionStatus(start_at, end_at, options.max_days),
    },
    type: {
      description: "Is it a fair booth or a show?",
      type: GraphQLString,
      resolve: ({ fair }) => (isExisty(fair) ? "Fair Booth" : "Show"),
    },
  }),
})

const Show = {
  type: ShowType,
  description: "A Show",
  args: {
    id: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The slug or ID of the Show",
    },
  },
  resolve: (_root, { id }, _request, { rootValue: { showLoader } }) => {
    return showLoader(id)
      .then(show => {
        if (!show.displayable && !show.is_reference) {
          return new HTTPError("Show Not Found", 404)
        }
        return show
      })
      .catch(() => null)
  },
}

export default Show
export const showConnection = connectionWithCursorInfo(ShowType)
