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
    lineReader.on('line', (line: string) => {
      if (line.startsWith('#')) {
        header.push(line)
        return
      }
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
      if (line.search('}') > -1) {
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
  custom?: (a: { line: string, name: string, type?: string, lineName: string, lineDef: string }) => boolean
  line?: IFilterable
  fieldName?: IFilterable
  type?: 'input' | 'type'
  invert?: boolean
  name?: IFilterable
  except?: IFilterable
  exceptName?: IFilterable
  add?: string
  transformField?: {
    prepend?: string,
    append?: string,
    custom?: (a: { line: string, name: string, type?: string, lineName: string, lineDef: string }) => string,
  }
}

const filterSchema = (schemaPath: string, out: string, fieldFilters: IFilter[] = [], { info }: {
  info: {
    remove?: boolean,
    match?: boolean
  }} = {info: {}}
) =>
  parse(schemaPath)
    .then(
      ({ header, schema, scalars }) => {
        let bkFile = ''
        const schemaTypes = Object.keys(schema)
        let output = [...header, ...scalars].join('\n')
        for (const schemaType of schemaTypes) {
          const typeNames = schema[schemaType]
          for (const typeName of Object.keys(typeNames)) {
            const { description, fields, rest } = typeNames[typeName]
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
                    info.match && console.log('match', match, fieldName, lineName, line, fieldLine)
                    if (!match) {
                      return fieldLine
                    }
                    const {prepend, append, custom: customTransform} = transformField
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
                  if (remove !== !!invert && info.remove) {
                    console.info(`Removed ${fieldLine.trim()} from ${typeName} (${schemaType})`)
                    console.debug(filter)
                  }
                  return remove === !!invert
                })
              }
            }
            // tslint:disable-next-line
            output += `\n${
              description.join('\n')}\n${
              schemaType} ${typeName} ${rest} {\n${
              [...addition, ...filteredFields]
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
