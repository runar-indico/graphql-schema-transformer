import fs from 'fs'
import path from 'path'

export type Types = 'type' | 'input' | 'enum' | 'interface'

interface IType {
  description: string[]
  fields: string[]
  name: string
  rest: string[]
  type: Types
}

interface ISchema {
  [s: string]: {
    [s: string]: IType,
  }
}

const parse = (file: string) => new Promise<{ scalars: string[], header: string[], schema: ISchema }>(
  (resolve, _reject) => {
    const header: string[] = []
    const scalars: string[] = []
    const schema: ISchema = {}
    const resetCurrent = (): IType => ({
      description: [],
      fields: [],
      name: '',
      rest: [],
      type: '' as any,
    })

    const lineReader = require('readline').createInterface({
      input: fs.createReadStream(file),
    })

    let current = resetCurrent()
    let seenNonComment = false
    lineReader.on('line', (line: string) => {
      if (!line.trim()) {
        // Remove blank lines
        return
      }
      if (line.startsWith('#')) {
        if (!seenNonComment) {
          // Just random generated comments at top.
          return
        }
        // current.description.push(line.replace('#', '"""') + '"""')
        current.description.push(line)
        return
      }
      seenNonComment = true
      if (line.startsWith('scalar')) {
        scalars.push(line)
        // return
      }
      if (line.endsWith('{')) {
        const m = line.match(/(\w+)\b/g)
        if (m) {
          const [type, name, ...rest] = m
          current.type = type as Types
          current.name = name
          current.rest = rest
          return
        }
      }
      const endCurly = line.search('}')
      const comment = line.search('#')
      if (endCurly > -1 && (comment === -1 || endCurly < comment)) {
        const { type, name } = current
        if (!type) {
          return
        }
        if (!schema[type]) {
          schema[type] = {}
        }
        schema[type as any][name] = current
        current = resetCurrent()
        return
      }
      if (!current.type) {
        current.description.push(line)
        return

      }
      current.fields.push(line)
    })
    lineReader.on('close', () => resolve({ schema, header, scalars }))
  },
)

export type IFilterable = string | RegExp | string[]

export interface IFilter {
  custom?: (a: { line: string, name: string, type?: string, lineName: string, lineDef: string }) => boolean | string
  line?: IFilterable
  fieldName?: IFilterable
  type?: 'input' | 'type'
  invert?: boolean
  name?: IFilterable
  except?: IFilterable
  exceptName?: IFilterable
  nodeDescription?: string
  add?: string
  transformField?: {
    prepend?: string,
    append?: string,
    custom?: (a: { line: string, name: string, type?: string, lineName: string, lineDef: string }) => string,
  }
}


const filterSchema = (schemaPath: string, out: string, fieldFilters: IFilter[], { descriptions, removeCommaInDescription = true }: {
  /**
 * [type/input/enum].[nodeName].[fieldName]: string
 * Example:
```
descriptions: {
  type: {
    album: {
      name: 'The name of the album',
    }
  }
}
```
 */
  descriptions: {
    [s: string]: { [s: string]: { [s: string]: string } }
  },
  removeCommaInDescription?: boolean
}
) =>
  parse(schemaPath)
    .then(
      ({ schema }) => {
        let bkFile = ''
        const formatDescription = (desc: string) => {
          const stripped = removeCommaInDescription ? desc.replace(/,/g, '') : desc
          return `""" ${stripped}"""`
        }
        const schemaTypes = Object.keys(schema)
        let output = ''
        for (const schemaType of schemaTypes) {
          const typeNames = schema[schemaType]
          for (const typeName of Object.keys(typeNames)) {
            let { description, fields, rest } = typeNames[typeName]
            const addition: string[] = []
            let filteredFields = fields
            for (const filter of fieldFilters) {
              const { transformField, add, exceptName, except, invert, type, line, name, fieldName, custom } = filter
              if (type && type !== schemaType) {
                continue
              }
              if (name && !fieldTest(name, typeName, exceptName)) {
                continue
              }

              if (add) {
                addition.push(add)
              }
              if (transformField) {
                filteredFields = filteredFields.map(
                  (fieldLine) => {
                    const fieldSplitted = fieldLine.match(/(\w*):\s(\w*)/)
                    const [_, lineName, lineDef] = fieldSplitted || ['', '', '']
                    const match = fieldTest(fieldName, lineName, except) || fieldTest(line, fieldLine, except)
                    if (!match) {
                      return fieldLine
                    }
                    const { prepend, append, custom: customTransform } = transformField
                    if (customTransform) {
                      return customTransform({
                        lineDef,
                        lineName,
                        type,
                        line: fieldLine,
                        name: typeName,
                      })
                    }
                    return [prepend, fieldLine, append].filter((a) => a).join('\n')
                  },
                )
              } else {
                filteredFields = filteredFields.filter((fieldLine: string) => {
                  const fieldSplitted = fieldLine.match(/(\w*):\s(\w*)/)
                  const [_, lineName, lineDef] = fieldSplitted || ['', '', '']
                  const remove = custom
                    ? custom({
                      lineDef,
                      lineName,
                      type,
                      line: fieldLine,
                      name: typeName,
                    })
                    : (fieldTest(fieldName, lineName, except) || fieldTest(line, fieldLine, except))
                  return remove === !!invert
                })
              }
            }
            let previous = ''
            let openBrace = false

            const nodeDescriptions = descriptions && descriptions[schemaType] && descriptions[schemaType][typeName]
            const reducedFields = filteredFields.reduce(
              (r, line) => {
                const trimmed = line.trim()
                // Turn comments into descriptions, since graphql-codegen for some reason
                // does the opposite.
                if (trimmed.startsWith('#')) {
                  previous = '  ' + formatDescription(trimmed.replace('#', ''))
                  r.push(previous)
                  return r
                }
                const match = trimmed.match(/^(\w*)([\:(])/)
                const [_, firstWord, colonBrace] = match || ['', '', '']
                if (colonBrace === '(') {
                  openBrace = true
                }
                if (openBrace && line.search(/\):\s/) > -1) {
                  openBrace = false
                }
                if (!openBrace && !!nodeDescriptions && !!nodeDescriptions[firstWord]) {
                  previous = "  " + formatDescription(nodeDescriptions[firstWord]) + '\n' + line
                  r.push(previous)
                  return r
                }
                previous = line
                r.push(previous)
                return r
              }, [] as string[])
            // tslint:disable-next-line
            const nodeDescription = nodeDescriptions && nodeDescriptions['__node']
            if (nodeDescription) {
              description = [formatDescription(nodeDescription)]
            }
            output += `\n${
              description
                .filter(Boolean)
                .join('\n')}\n${
              schemaType} ${typeName} ${rest} {\n${
              [...addition, ...reducedFields]
                .join('\n')}\n}`
          }
        }
        // Remove any empty inputs
        output = output.replace(/input\s*\w*\s*{\s*}/, '')
        if (fs.existsSync(out)) {
          bkFile = path.join(out, '..', '.bk.' + path.basename(out))
          fs.copyFileSync(out, bkFile)
        }
        fs.writeFileSync(out, output)
        return { out, bkFile }
      },
    )

const fieldTest = (filter: IFilterable | undefined, field: string, except?: IFilterable) => {
  if (!filter) {
    return false
  }
  if (Array.isArray(filter)) {

    return filter.includes(field)
  }
  return field.search(filter) > -1 && (!field || !fieldTest(except, field))
}

export default filterSchema
