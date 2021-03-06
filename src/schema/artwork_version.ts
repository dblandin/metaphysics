import {
  GraphQLID,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
} from "graphql"
import { artistNames } from "./artwork/meta.js"
import Image from "./image"

export const ArtworkVersion = new GraphQLObjectType({
  name: "ArtworkVersion",
  fields: () => ({
    id: {
      type: new GraphQLNonNull(GraphQLID),
      description: "ID of the order line item",
    },

    title: {
      type: GraphQLString,
      description: "Artwork title",
    },

    defaultImageID: {
      type: GraphQLString,
      description: "The Image id",
      resolve: ({ default_image_id }) => default_image_id,
    },

    artists: {
      type: GraphQLString,
      description: "The artists related to this Artwork Version",
      resolve: (
        version,
        _options,
        _request,
        { rootValue: { artistsLoader } }
      ) => artistsLoader({ id: version.artist_ids }),
    },

    artistNames: {
      type: GraphQLString,
      description: "The names for the artists related to this Artwork Version",
      resolve: async (
        version,
        _options,
        _request,
        { rootValue: { artistsLoader } }
      ) => {
        const artists = await artistsLoader({ id: version.artist_ids })
        return artistNames(artists)
      },
    },

    image: {
      type: Image.type,
      description: "The image representing the Artwork Version",
      resolve: (
        version,
        _options,
        _request,
        { rootValue: { artworkImageLoader } }
      ) =>
        artworkImageLoader({
          artwork_id: version.artwork_id,
          image_id: version.default_image_id,
        }),
    },
  }),
})
