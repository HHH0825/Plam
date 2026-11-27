import { Button, Image, Input, Text, View } from '@tarojs/components'
import type { IntentAction, StorageLocationsModel } from '../../contracts/storage-locations'

type Props = Pick<StorageLocationsModel, 'shownLocations' | 'query' | 'locationCount' | 'unassigned' | 'busy'>
  & { emit: (action: IntentAction) => void }

export function LocationList({ shownLocations, query, locationCount, unassigned, busy, emit }: Props) {
  return <>
    <View className='sl-toolbar'>
      <Input className='sl-search' value={query} onInput={e => emit({ type: 'search-locations', value: e.detail.value })}
        placeholder='搜索位置' ariaLabel='搜索位置' />
      <Button className='sl-button' disabled={busy} onClick={() => emit({ type: 'start-create' })}>新增位置</Button>
    </View>
    <Button className='sl-row' id='sl-location-unassigned' disabled={busy}
      onClick={() => emit({ type: 'open-location', id: null })}>
      <View className='sl-location-icon sl-question'>?</View>
      <View className='sl-row-copy'>
        <Text className='sl-row-title'>未设置位置</Text>
        <Text className='sl-muted'>还没找到小窝的物品</Text>
      </View>
      <Text className='sl-count'>{unassigned} 件</Text><Text className='sl-arrow'>›</Text>
    </Button>
    {shownLocations.map(location => <Button className='sl-row' id={'sl-location-' + location.id} key={location.id}
      disabled={busy} onClick={() => emit({ type: 'open-location', id: location.id })}>
      <Image className='sl-location-icon' src='/assets/purchase-entry/storage.png' ariaHidden />
      <View className='sl-row-copy'><Text className='sl-row-title'>{location.name}</Text></View>
      <Text className='sl-count'>{location.count} 件</Text><Text className='sl-arrow'>›</Text>
    </Button>)}
    {!locationCount && <View className='sl-empty'>先建一个位置，再把物品放进去吧。</View>}
    {locationCount > 0 && !shownLocations.length && <View className='sl-empty'>没有找到这个位置</View>}
  </>
}
