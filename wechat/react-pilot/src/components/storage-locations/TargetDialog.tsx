import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import type { IntentAction, StorageLocationsModel } from '../../contracts/storage-locations'

type Props = Pick<StorageLocationsModel, 'targetQuery' | 'targets' | 'busy' | 'conflict'>
  & { emit: (action: IntentAction) => void }

export function TargetDialog({ targetQuery, targets, busy, conflict, emit }: Props) {
  return <View className='sl-mask'>
    <View className='sl-dialog'>
      <View className='sl-detail-heading'>
        <Text className='sl-section-title'>移动到哪里？</Text>
        <Button className='sl-text' disabled={busy} onClick={() => emit({ type: 'close-target' })}>关闭</Button>
      </View>
      <Input className='sl-search' value={targetQuery} placeholder='搜索目标位置' ariaLabel='搜索目标位置'
        onInput={e => emit({ type: 'search-targets', value: e.detail.value })} />
      <ScrollView scrollY className='sl-targets'>
        {targets.map(target => <Button className='sl-row sl-target' key={target.id ?? 'unassigned'}
          disabled={busy || conflict} onClick={() => emit({ type: 'select-target', id: target.id })}>{target.name}</Button>)}
        {!targets.length && <View className='sl-empty'>没有找到这个位置</View>}
      </ScrollView>
    </View>
  </View>
}
