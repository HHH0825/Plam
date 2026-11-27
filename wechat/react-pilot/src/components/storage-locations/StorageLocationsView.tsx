import { Button, Image, Text, View } from '@tarojs/components'
import type { IntentAction, StorageLocationsProps } from '../../contracts/storage-locations'
import { BatchActions } from './BatchActions'
import { ItemList } from './ItemList'
import { LocationList } from './LocationList'
import { LocationNameForm } from './LocationNameForm'
import { TargetDialog } from './TargetDialog'

export function StorageLocationsView({ model, onIntent }: StorageLocationsProps) {
  const emit = (action: IntentAction) => onIntent({ ...action, version: 1, viewEpoch: model.viewEpoch })
  return <View className='sl'>
    <View className='sl-heading'>
      <View>
        <Text className='sl-title'>收纳位置</Text>
        <View className='sl-muted'>给每件物品找个小窝。</View>
      </View>
      <Image className='sl-mascot' src='/assets/purchase-entry/storage.png' ariaHidden />
    </View>
    {model.assignItemId !== null && <View className='sl-message'>请选择这件物品的新位置</View>}
    {model.error && <View className='sl-message' ariaRole='alert'>
      <Text>{model.error}</Text>
      {model.conflict && <Button className='sl-text' disabled={model.busy || model.loading}
        onClick={() => emit({ type: 'review-conflict' })}>刷新并核对选择</Button>}
      {!model.ready && !model.loading && <Button className='sl-text'
        onClick={() => emit({ type: 'retry' })}>重新检查</Button>}
    </View>}
    {model.ready && !model.loading && <>
      {model.naming && <LocationNameForm renameId={model.renameId} nameDraft={model.nameDraft}
        busy={model.busy || model.conflict} emit={emit} />}
      {model.mode === 'locations' ? <LocationList shownLocations={model.shownLocations}
        query={model.query} locationCount={model.locationCount} unassigned={model.unassigned}
        busy={model.busy} emit={emit} /> :
        <>
          <ItemList locationId={model.locationId} locationName={model.locationName} itemQuery={model.itemQuery}
            shownItems={model.shownItems} picking={model.picking} selecting={model.selecting}
            chosenCount={model.chosenCount} busy={model.busy} emit={emit} />
          {model.selecting && <BatchActions picking={model.picking} selecting={model.selecting}
            chosenCount={model.chosenCount} busy={model.busy} conflict={model.conflict} emit={emit} />}
        </>}
      {model.targetOpen && <TargetDialog targetQuery={model.targetQuery} targets={model.targets}
        busy={model.busy} conflict={model.conflict} emit={emit} />}
    </>}
  </View>
}
