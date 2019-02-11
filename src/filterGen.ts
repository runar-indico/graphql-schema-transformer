import { IFilterable, IFilter, Types } from ".";

export const filterGen = (
  filter: { [s: string]: IFilterable },
  s: IFilter = {},
  key = 'line',
) => Object.keys(filter)
  .map((name): IFilter => ({
    name,
    [key]: filter[name],
    type: 'input',
    ...s,
  }))


export const typeDescriptions = (descriptions: {
  [s in Types]?: {
    [s: string]: {[s: string]: string}
  }
}) => Object.keys(descriptions).reduce(
  (r, key) => {
    const typeNames = descriptions[key]
    for (const typeName of Object.keys(typeNames)) {
      const fieldNames = typeNames[typeName]
      for (const fieldName of Object.keys(fieldNames)) {
        r.push({
          type: key as any,
          name: typeName,
          fieldName,
          transformField: {
            prepend: `  """${fieldNames[fieldName]}"""`,
          },
        })

      }

    }
    return r
  },
  [] as IFilter[],
)
