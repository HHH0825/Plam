import { Button, Image, Input, Text, View } from '@tarojs/components'
import type { IntentAction, StorageLocationsModel } from '../../contracts/storage-locations'

type Props = Pick<StorageLocationsModel, 'locationId' | 'locationName' | 'itemQuery' | 'shownItems' |
  'picking' | 'selecting' | 'chosenCount' | 'busy'> & { emit: (action: IntentAction) => void }

export function ItemList({ locationId, locationName, itemQuery, shownItems,
  selecting, chosenCount, busy, emit }: Props) {
  return <>
    <Button className='sl-text' disabled={busy} onClick={() => emit({ type: 'back-to-locations' })}>‹ 全部位置</Button>
    <View className='sl-detail-heading'>
      <Text className='sl-section-title'>{locationName}</Text>
      {locationId !== null && !selecting && <View className='sl-actions'>
        <Button className='sl-text' disabled={busy} onClick={() => emit({ type: 'start-rename' })}>改名</Button>
        <Button className='sl-text sl-danger' disabled={busy} onClick={() => emit({ type: 'delete-location' })}>删除</Button>
      </View>}
    </View>
    <View className='sl-toolbar'>
      <Input className='sl-search' placeholder='搜索物品' ariaLabel='搜索物品' value={itemQuery}
        onInput={e => emit({ type: 'search-items', value: e.detail.value })} />
      {!selecting && <>
        <Button className='sl-button' disabled={busy} onClick={() => emit({ type: 'start-add' })}>添加物品</Button>
        <Button className='sl-text' disabled={busy} onClick={() => emit({ type: 'start-selection' })}>多选</Button>
      </>}
    </View>
    {selecting && <View className='sl-detail-heading'>
      <Text>已选 {chosenCount} / 50 件</Text>
      <Button className='sl-text' disabled={busy} onClick={() => emit({ type: 'cancel-selection' })}>取消选择</Button>
    </View>}
    {shownItems.map(item => <Button className={item.checked ? 'sl-row sl-selected' : 'sl-row'}
      id={'sl-item-' + item.id} key={item.id} disabled={busy || item.alreadyHere}
      onClick={() => emit({ type: 'tap-item', id: item.id })}>
      {selecting && <Text className={item.checked ? 'sl-check sl-checked' : 'sl-check'}>{item.checked ? '✓' : ''}</Text>}
      {item.imageSrc && <Image className='sl-photo' key={item.imageSrc} mode='aspectFill' src={item.imageSrc}
        onError={() => emit({ type: 'photo-failed', id: item.id, src: item.imageSrc })} />}
      <View className='sl-row-copy'>
        <Text className='sl-row-title'>{item.name}</Text>
        <View><Text className='sl-muted'>{item.category}</Text><Text className={'sl-pill sl-' + item.status}>{item.statusText}</Text></View>
        <Text className='sl-muted'>{item.alreadyHere ? '已在这里' : item.storageLocationName}</Text>
      </View>
      {!selecting && <Text className='sl-arrow'>›</Text>}
    </Button>)}
    {!shownItems.length && <View className='sl-empty'>
      {itemQuery ? '没有找到这件物品' : '这里还没有物品，添加几件吧。'}
    </View>}
  </>
}
