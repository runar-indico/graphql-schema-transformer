# Prisma-schema-transformer

Unofficial schema-tranformer used to transform autogenerated graphql-schemas.

This library first parser a schema, then lets you use filter, attach and transform
to any fields or node matching either strict matches, or more loosely to any regex.

This makes this library very flexible.

## Usage


```typescript
import filterSchema, { IFilter } from 'graphql-schema-transformer'
import { filterGen, typeDescriptions } from 'graphql-schema-transformer/dist/filterGen'

type Pick = Pick<T, Exclude<keyof T, K>>

// General filters
const inputFilters: Array<Omit<IFilter, 'type'>> = [
  {
    // Remove all input where the fields are `createdBy` or `delete` in ANY input
    fieldName: ['createdBy', 'delete'],
  },
  {

    name: /^UserCreateInput/,
    // Remove any fields NOt (invert) listed here:
    fieldName: /firstName|active|lastName|userName|email|altId|altInfo|authPermissions/,
    invert: true,
    // Add these lines:
    add: '  authPermissions: [AuthPermissions!]!\n  password: String!',
  },
  {
    name: /PermissionUpdateManyWithout\w*Input/,
    line: /connect|disconnect/,
    exceptName: 'PermissionUpdateManyWithoutObjectDetailInput',
    invert: true,
  },

]

// filterGen is a helper for creating filters with less code
const includeOnlyLinesMatching = filterGen({
  CollectionUpdateOneWithoutAlbumInput: /connect|disconnect/,
  ObjectDetailUpdateManyWithoutAlbumInput: /connect|create|disconnect/,
  AlbumCreateManyWithoutCollectionInput: /connect/,
  MetaDataFieldCreateOneInput: /connect/,
  ObjectCreateOneInput: /connect/,
  PermissionUpdateManyWithoutObjectDetailInput: /update[^M]/,
  ObjectDetailCreateOneInput: /connect/,
  TagCreateManyInput: /connect/,
  CollectionCreateOneWithoutAlbumsInput: /connect/,
  UserGroupUpdateInput: /name|description/,
  UserGroupUpdateOneInput: /connect|disconnect/,
  ObjectUpdateOneInput: /connect|disconnect/,
  UserCreateOneInput: /connect/,
  FormCreateManyInput: /connect/,
  ObjectDetailCreateManyWithoutTagsInput: /connect/,
  // TagUpdateManyInput: /create|connect|disconnect/,
}, { invert: true })

const excludeLinesMatching = filterGen({
  PermissionCreateInput: /objectDetail|collections|albums/,
  PermissionUpdateInput: /objectDetail|collections|albums/,
  CollectionCreateWithoutAlbumsInput: /groups|users|permissions/,
  AlbumCreateInput: /collection/,
  TagCreateInput: /forms/,
  TagUpdateInput: /forms/,
  PermissionUpdateWithoutObjectDetailDataInput: /user|collections|albums/,
  ObjectDetailUpdateInput: /object|metadata|original|album|actions/,
  AlbumCreateWithoutObjectDetailsInput: /collection/,
  CollectionCreateInput: /group/,
  UserGroupCreateInput: /subGroups|parentGroup/,
})

// typeDescriptions are a custom filter-creator used for adding descriptions
const descriptions = typeDescriptions({
  type: {
    User: {
      id: 'Id of user, (see authId)',
      authId: 'Id used by auth.',
      firstName: 'First name of user',
      active: 'Controls whether a user is able to interact or not with papi',
      lastName: 'Family name of user',
      userName: 'Preferred username',
      email: 'Email of user',
      altId: 'An alternative user-id, in an external database.',
      altInfo: 'Any external info about the user',
    },
  },
  input: {
    UserCreateInput: {
      altId: 'Set to your external id',
    },
  },
})

const fieldFilters = [
  ...inputFilters.map((s) => ({ type: 'input' as any, ...s })),
  ...includeOnlyLinesMatching,
  ...excludeLinesMatching,
  ...descriptions,
]

filterSchema(
  './src/schemas/generated/prisma.graphql', // input
  './src/schemas/generated/preApp.graphql', // output
  fieldFilters)
```
