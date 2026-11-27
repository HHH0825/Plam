export type LocationId = number | null
export type LocationRow = Readonly<{ id: number; name: string; count: number }>
export type ItemRow = Readonly<{
  id: number
  name: string
  category: string
  status: 'active' | 'idle'
  statusText: string
  storageLocationName: string
  checked: boolean
  alreadyHere: boolean
  imageSrc: string
}>
export type TargetRow = Readonly<{ id: LocationId; name: string }>

export type StorageLocationsModel = Readonly<{
  version: 1
  viewEpoch: number
  loading: boolean
  ready: boolean
  busy: boolean
  conflict: boolean
  error: string
  mode: 'locations' | 'items'
  locationId: LocationId
  locationName: string
  assignItemId: number | null
  query: string
  itemQuery: string
  targetQuery: string
  locationCount: number
  unassigned: number
  shownLocations: readonly LocationRow[]
  shownItems: readonly ItemRow[]
  naming: boolean
  renameId: number | null
  nameDraft: string
  picking: boolean
  selecting: boolean
  chosenCount: number
  targetOpen: boolean
  targets: readonly TargetRow[]
}>

export type IntentAction =
  | { type: 'retry' | 'review-conflict' | 'back-to-locations' }
  | { type: 'start-create' | 'start-rename' | 'delete-location' | 'save-name' | 'cancel-name' }
  | { type: 'start-add' | 'start-selection' | 'cancel-selection' }
  | { type: 'choose-target' | 'close-target' | 'add-selected' | 'clear-selected' }
  | { type: 'search-locations' | 'search-items' | 'search-targets' | 'edit-name'; value: string }
  | { type: 'open-location' | 'select-target'; id: LocationId }
  | { type: 'tap-item'; id: number }
  | { type: 'photo-failed'; id: number; src: string }

export type StorageLocationsIntent = Readonly<IntentAction & { version: 1; viewEpoch: number }>
export type StorageLocationsProps = Readonly<{
  model: StorageLocationsModel
  onIntent: (intent: StorageLocationsIntent) => void
}>

type RecordValue = Record<string, unknown>
type Check = (value: unknown) => boolean
const object = (value: unknown): value is RecordValue => {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || Object.getPrototypeOf(prototype) === null
}
const string = (value: unknown) => typeof value === 'string'
const boolean = (value: unknown) => typeof value === 'boolean'
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const locationId = (value: unknown) => value === null || id(value)
const status = (value: unknown) => value === 'active' || value === 'idle'
const mode = (value: unknown) => value === 'locations' || value === 'items'

function fields(value: unknown, schema: Record<string, Check>): boolean {
  if (!object(value) || Object.keys(value).length !== Object.keys(schema).length) return false
  return Object.entries(schema).every(([key, check]) =>
    Object.prototype.hasOwnProperty.call(value, key) && check(value[key]))
}

function rows(schema: Record<string, Check>): Check {
  return value => Array.isArray(value) && Array.from(value).every(row => fields(row, schema))
}

const locationRow = { id, name: string, count }
const itemRow = {
  id, name: string, category: string, status, statusText: string, storageLocationName: string,
  checked: boolean, alreadyHere: boolean, imageSrc: string,
}
const version = (value: unknown) => value === 1
const modelFields = {
  version, viewEpoch: count, loading: boolean, ready: boolean, busy: boolean, conflict: boolean,
  error: string, mode, locationId, locationName: string, assignItemId: locationId,
  query: string, itemQuery: string, targetQuery: string, locationCount: count, unassigned: count,
  shownLocations: rows(locationRow), shownItems: rows(itemRow), naming: boolean, renameId: locationId,
  nameDraft: string, picking: boolean, selecting: boolean, chosenCount: count, targetOpen: boolean,
  targets: rows({ id: locationId, name: string }),
} satisfies Record<keyof StorageLocationsModel, Check>

const noPayload = {}
const textPayload = { value: string }
const locationPayload = { id: locationId }
const actionFields = {
  retry: noPayload, 'review-conflict': noPayload, 'back-to-locations': noPayload,
  'start-create': noPayload, 'start-rename': noPayload, 'delete-location': noPayload,
  'save-name': noPayload, 'cancel-name': noPayload, 'start-add': noPayload,
  'start-selection': noPayload, 'cancel-selection': noPayload, 'choose-target': noPayload,
  'close-target': noPayload, 'add-selected': noPayload, 'clear-selected': noPayload,
  'search-locations': textPayload, 'search-items': textPayload, 'search-targets': textPayload,
  'edit-name': textPayload, 'open-location': locationPayload, 'select-target': locationPayload,
  'tap-item': { id }, 'photo-failed': { id, src: value => typeof value === 'string' && value.length > 0 },
} satisfies Record<IntentAction['type'], Record<string, Check>>

export function initialModel(viewEpoch: number): StorageLocationsModel {
  return {
    version: 1, viewEpoch, loading: true, ready: false, busy: false, conflict: false, error: '',
    mode: 'locations', locationId: null, locationName: '', assignItemId: null, query: '', itemQuery: '',
    targetQuery: '', locationCount: 0, unassigned: 0, shownLocations: [], shownItems: [], naming: false,
    renameId: null, nameDraft: '', picking: false, selecting: false, chosenCount: 0,
    targetOpen: false, targets: [],
  }
}

export function parseModel(input: unknown): StorageLocationsModel | null {
  return fields(input, modelFields) ? input as StorageLocationsModel : null
}

export function parseIntent(input: unknown): StorageLocationsIntent | null {
  if (!object(input) || typeof input.type !== 'string' ||
      !Object.prototype.hasOwnProperty.call(actionFields, input.type)) return null
  const schema = actionFields[input.type as IntentAction['type']]
  if (!fields(input, { version, viewEpoch: id, type: string, ...schema })) return null
  return { ...input } as StorageLocationsIntent
}
